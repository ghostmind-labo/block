/**
 * The models a person may choose for the chat, read live from OpenRouter, by the rules of the system's
 * OpenRouter guide (new-app/references/openrouter.md) and as tags reads them (shared/server/ai-model-list.ts).
 *
 * Offered: every model that takes tool calls and can be told which tool to call, answers in text, and holds at
 * least 64K tokens. Left out: `:variant` ids, OpenRouter's own routers, models that answer with pictures or
 * sound, and models with an expiration date. The `~maker/family-latest` aliases lead each maker's group, the
 * default first. The list's own filters silently drop every alias, so ALL models are read and filtered here.
 *
 * A model the person chose is never swapped for another. When OpenRouter stops listing it, `isListedModel` says
 * so and a call refuses with `modelGone`. Cached for an hour per process; when OpenRouter cannot be read, a
 * well-formed id is accepted, and OpenRouter itself refuses one it does not know.
 */
import { OpenRouter } from "@openrouter/sdk";
import type { Model } from "@openrouter/sdk/models";
import { env } from "../env.ts";
import { ApiError } from "../errors.ts";

/** A model as the picker shows it. */
export interface CatalogModel {
  id: string;
  /** The model's name without its maker. */
  label: string;
  /** Who makes it, as OpenRouter writes it: the picker groups by it. */
  maker: string;
  /** What an alias points at today, else the context it holds. */
  note: string;
  /** A `~maker/family-latest` alias, which OpenRouter keeps on the newest of the family. */
  latest: boolean;
  /** USD per million tokens, in and out; null when OpenRouter prices it another way. */
  price: { input: number; output: number } | null;
  /** False for the person's own choice when OpenRouter no longer lists it: shown, not choosable. */
  available: boolean;
}

/** An alias OpenRouter keeps pointed at the newest Sonnet, so the default never ages. */
export const DEFAULT_MODEL = "~anthropic/claude-sonnet-latest";

/** Makers shown first, in this order; every other maker follows alphabetically. */
const MAKER_ORDER = ["anthropic", "openai", "google", "x-ai", "deepseek", "qwen", "moonshotai", "z-ai", "minimax", "mistralai"];
const TTL = 60 * 60 * 1000;
const MIN_CONTEXT = 64_000;

interface LiveModel extends CatalogModel {
  created: number;
}
interface Listing {
  at: number;
  models: LiveModel[];
  /** Every id OpenRouter lists, offered or not: what is not here is gone. */
  listed: Set<string>;
}

let cache: Listing | null = null;
let pending: Promise<Listing | null> | null = null;

const openrouter = new OpenRouter({ httpReferer: env.publicUrl, appTitle: "block", timeoutMs: 10_000 });

/** The shape of an OpenRouter model id. Whether it is offered is the live list's answer. */
export const isModelId = (id: unknown): id is string => typeof id === "string" && id.length <= 120 && /^~?[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
const slugOf = (id: string) => id.replace(/^~/, "").split("/")[0];
const withoutMaker = (name: string) => {
  const at = name.indexOf(": ");
  return at > 0 ? name.slice(at + 2) : name;
};
const contextLabel = (tokens: number | null | undefined) => (!tokens ? "" : tokens >= 1_000_000 ? `${+(tokens / 1_000_000).toFixed(1)}M context` : `${Math.round(tokens / 1000)}K context`);

/** OpenRouter's names say "Maker: Model", not always the same way per maker: the most common spelling wins. */
function makerNames(models: Model[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const m of models) {
    const at = m.name.indexOf(": ");
    if (at <= 0) continue;
    const per = counts.get(slugOf(m.id)) ?? new Map<string, number>();
    const name = m.name.slice(0, at);
    per.set(name, (per.get(name) ?? 0) + 1);
    counts.set(slugOf(m.id), per);
  }
  return new Map([...counts].map(([slug, per]) => [slug, [...per].sort((a, b) => b[1] - a[1])[0][0]]));
}

function offered(m: Model): boolean {
  const out: string[] = m.architecture.outputModalities ?? [];
  return (
    isModelId(m.id) &&
    !m.id.includes(":") &&
    !m.id.startsWith("openrouter/") &&
    m.supportedParameters.includes("tools") &&
    m.supportedParameters.includes("tool_choice") &&
    (m.contextLength ?? 0) >= MIN_CONTEXT &&
    out.includes("text") &&
    !out.some((o) => o === "image" || o === "audio") &&
    !m.expirationDate
  );
}

function toLive(m: Model, makers: Map<string, string>): LiveModel {
  const latest = m.id.startsWith("~");
  const input = Number(m.pricing.prompt);
  const output = Number(m.pricing.completion);
  return {
    id: m.id,
    label: withoutMaker(m.name),
    maker: makers.get(slugOf(m.id)) ?? slugOf(m.id),
    note: latest && m.aliasTarget ? `Now ${withoutMaker(m.aliasTarget.name)}` : contextLabel(m.contextLength),
    latest,
    price: Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0 ? { input: input * 1e6, output: output * 1e6 } : null,
    available: true,
    created: m.created,
  };
}

const makerRank = (id: string) => {
  const i = MAKER_ORDER.indexOf(slugOf(id));
  return i === -1 ? MAKER_ORDER.length : i;
};

const ordered = (models: LiveModel[]) =>
  models.sort(
    (a, b) =>
      makerRank(a.id) - makerRank(b.id) ||
      a.maker.localeCompare(b.maker) ||
      Number(b.id === DEFAULT_MODEL) - Number(a.id === DEFAULT_MODEL) ||
      Number(b.latest) - Number(a.latest) ||
      b.created - a.created ||
      a.label.localeCompare(b.label),
  );

async function load(): Promise<Listing | null> {
  try {
    const all: Model[] = [];
    for await (const page of await openrouter.models.list({})) all.push(...(page.result?.data ?? []));
    const makers = makerNames(all);
    const models = ordered(all.filter(offered).map((m) => toLive(m, makers)));
    if (!models.length) throw new Error("OpenRouter listed no model");
    cache = { at: Date.now(), models, listed: new Set(all.map((m) => m.id)) };
    return cache;
  } catch {
    // keep what was read last; null only when OpenRouter has never answered
    return cache;
  } finally {
    pending = null;
  }
}

async function listing(): Promise<Listing | null> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  return (pending ??= load());
}

/** What the picker shows: the models offered now, and the default. */
export async function offeredModels(): Promise<{ models: CatalogModel[]; default_model: string }> {
  const live = (await listing())?.models.map(({ created: _created, ...m }) => m);
  return {
    // OpenRouter could not be read: the default alone, so the picker still shows what runs
    models: live ?? [{ id: DEFAULT_MODEL, label: "Claude Sonnet Latest", maker: "Anthropic", note: "", latest: true, price: null, available: true }],
    default_model: DEFAULT_MODEL,
  };
}

/** Waits only while this process has never read the list, so isListedModel knows a model that is gone. */
export async function modelsReady(): Promise<void> {
  if (cache) {
    if (Date.now() - cache.at >= TTL) void listing();
    return;
  }
  await listing();
}

/** For a write: is this a model a person may choose now? */
export async function isOfferedModel(id: unknown): Promise<boolean> {
  if (!isModelId(id)) return false;
  const known = await listing();
  return known ? known.models.some((m) => m.id === id) : true;
}

/** For a read: false only when the last list read no longer has the model at all. */
export function isListedModel(id: unknown): id is string {
  if (!isModelId(id)) return false;
  if (!cache || Date.now() - cache.at >= TTL) void listing();
  return !cache || cache.listed.has(id);
}

/** The refusal for a model OpenRouter no longer has, with where to choose another. */
export const modelGone = (id: string) => new ApiError(409, `The model ${id} is no longer available on OpenRouter. Choose another in Settings → AI.`, "ai_model_gone");
