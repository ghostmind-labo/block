/**
 * A person's own OpenRouter account: connecting it (PKCE), the model they chose, and the one call the chat makes.
 * Same rules as tags (shared/server/ai-connection.ts, ai-models.ts) and the system's OpenRouter guide:
 *
 *   - Their key, never the owner's. Without a connection, the chat says how to connect and does nothing else.
 *   - The key is stored encrypted (AES-GCM, AI_KEY_ENCRYPTION_KEY) in `ai_connection`, which no role but this
 *     server reads; it is decrypted only for the call. A client sees that a connection exists and its last four.
 *   - The model they chose is never swapped: one OpenRouter dropped refuses, with where to choose another.
 *
 * PKCE: the web app keeps the verifier (sign-in here is a token in the browser, not a cookie), sends the person
 * to OpenRouter with the challenge, and hands the code and the verifier back to `connect`.
 */
import { gql } from "../db/hasura.ts";
import { ApiError } from "../errors.ts";
import { DEFAULT_MODEL, isListedModel, isOfferedModel, modelGone, modelsReady } from "./models.ts";
import { openSecret, sealSecret } from "./secret-box.ts";

const OPENROUTER = "https://openrouter.ai/api";
const KEY_ENV = "AI_KEY_ENCRYPTION_KEY";

export interface AiStatus {
  connected: boolean;
  key_hint: string | null;
  /** The model the chat runs on: theirs, or the default. */
  model: string;
  /** True when they chose it; false when it is the default. */
  chosen: boolean;
  /** OpenRouter no longer lists their model: the chat refuses until they choose another. */
  gone: boolean;
}

/** A message of a tool-using conversation, in OpenRouter's (OpenAI's) format. */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface Row {
  key_ciphertext: string;
  key_hint: string;
  model: string | null;
}

async function row(userId: string): Promise<Row | null> {
  const data = await gql<{ ai_connection_by_pk: Row | null }>(`query($id: String!) { ai_connection_by_pk(user_id: $id) { key_ciphertext key_hint model } }`, { id: userId }, "admin");
  return data.ai_connection_by_pk;
}

function statusOf(found: Row | null): AiStatus {
  const model = found?.model ?? DEFAULT_MODEL;
  return { connected: Boolean(found), key_hint: found?.key_hint ?? null, model, chosen: Boolean(found?.model), gone: Boolean(found) && !isListedModel(model) };
}

export async function aiStatus(userId: string): Promise<AiStatus> {
  const [found] = await Promise.all([row(userId), modelsReady()]);
  return statusOf(found);
}

/** Trades the code OpenRouter sent back for the person's key, and keeps it encrypted. */
export async function connect(userId: string, code: string, verifier: string): Promise<AiStatus> {
  const res = await fetch(`${OPENROUTER}/v1/auth/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  });
  const body = (await res.json().catch(() => null)) as { key?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.key) throw new ApiError(502, `OpenRouter did not hand over a key${body?.error?.message ? `: ${body.error.message}` : ""}`);
  await gql(
    `mutation($row: ai_connection_insert_input!) {
      insert_ai_connection_one(object: $row, on_conflict: {constraint: ai_connection_pkey, update_columns: [key_ciphertext, key_hint]}) { user_id }
    }`,
    { row: { user_id: userId, key_ciphertext: sealSecret(body.key, KEY_ENV), key_hint: body.key.slice(-4) } },
    "admin",
  );
  return aiStatus(userId);
}

export async function disconnect(userId: string): Promise<void> {
  await gql(`mutation($id: String!) { delete_ai_connection_by_pk(user_id: $id) { user_id } }`, { id: userId }, "admin");
}

/** Chooses the model: one OpenRouter offers now; null goes back to the default. */
export async function chooseModel(userId: string, model: string | null): Promise<AiStatus> {
  if (model !== null && !(await isOfferedModel(model))) throw new ApiError(400, `"${model}" is not offered: choose a model OpenRouter lists with tool calls.`);
  const data = await gql<{ update_ai_connection_by_pk: { user_id: string } | null }>(
    `mutation($id: String!, $model: String) { update_ai_connection_by_pk(pk_columns: {user_id: $id}, _set: {model: $model}) { user_id } }`,
    { id: userId, model },
    "admin",
  );
  if (!data.update_ai_connection_by_pk) throw notConnected();
  return aiStatus(userId);
}

const notConnected = () => new ApiError(409, "Connect your OpenRouter account in Settings → AI first.", "ai_not_connected");

async function refusal(res: Response): Promise<ApiError> {
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = json?.error?.message ?? `OpenRouter answered ${res.status}`;
  if (res.status === 402) return new ApiError(402, `Your OpenRouter credits ran out. Add credits on openrouter.ai. (${message})`, "ai_credits");
  if (res.status === 401 || res.status === 403) return new ApiError(409, "OpenRouter no longer accepts your key. Reconnect it in Settings → AI.", "ai_not_connected");
  if (res.status === 400 && /not a valid model id/i.test(message)) return new ApiError(409, message, "ai_model_gone");
  if (/tool/i.test(message)) return new ApiError(409, `This model cannot call tools. Choose another in Settings → AI. (${message})`, "ai_no_tools");
  return new ApiError(502, `The AI call failed: ${message}`);
}

/** The person's model, bound to their key: one step of a conversation with tools. Refuses when not connected. */
export async function aiFor(userId: string) {
  const [found] = await Promise.all([row(userId), modelsReady()]);
  if (!found) throw notConnected();
  const key = openSecret(found.key_ciphertext, KEY_ENV);
  const model = found.model ?? DEFAULT_MODEL;
  return {
    model,
    async converse({ messages, tools, signal }: { messages: ChatMessage[]; tools: unknown[]; signal?: AbortSignal }): Promise<{ message: ChatMessage; model: string; cost: number }> {
      // never swapped: one OpenRouter no longer lists refuses before anything is sent
      if (!isListedModel(model)) throw modelGone(model);
      const res = await fetch(`${OPENROUTER}/v1/chat/completions`, {
        method: "POST",
        signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://block.ghostmind.dev", "X-Title": "block" },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 16_000,
          ...(tools.length ? { tools, provider: { require_parameters: true } } : {}),
          usage: { include: true },
        }),
      });
      if (!res.ok) {
        const error = await refusal(res);
        throw error.code === "ai_model_gone" ? modelGone(model) : error;
      }
      const json = (await res.json().catch(() => null)) as { model?: string; choices?: { message?: ChatMessage }[]; usage?: { cost?: number }; error?: { message?: string } } | null;
      const message = json?.choices?.[0]?.message;
      if (!message) throw new ApiError(502, `The AI call failed: ${json?.error?.message ?? "no answer"}`);
      return {
        message: { role: "assistant", content: message.content ?? null, ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) },
        model: json?.model ?? model,
        cost: json?.usage?.cost ?? 0,
      };
    },
  };
}
