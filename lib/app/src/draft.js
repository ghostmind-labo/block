// A live draft: the block being written, kept in one place that the chat, an agent on the MCP and the person
// all write, and that the open page draws again each time it changes. Publishing it keeps it as a block (a new
// one, or the one it was started from), and only when asked.
//
// A draft is for ONE kind of place (a slot), chosen before it is started and kept: a layout for the panel beside
// a map is not the box under the mouse. Another place is another draft.
//
// While it is written, a block is drawn with made-up data, the draft's `sample`: the block asks for it the way it
// will ask for the real object where it is used, through the app's `self()` call (`selfHost`). So the block is
// written once, against the shape of the app's data, and never against the sample itself.
//
// What is here is what does not depend on the app: the tools a model is given to work on the draft, in the
// shape OpenRouter and the MCP both take, the host that lends `self()`, and the words that say what a publish
// will do. Where the draft is kept, what the real object is and what a block is saved as are the app's.

import { defineHost } from "./host.js";
import { defineSlot } from "./slot.js";

// ---- a layout defined by the person: its room and the data it shows
//
// An app has its own places (slots). A playground, and an app that lets a person make a layout for a place of
// their own, takes the room from the person instead: a width (exact, or at most) and a height (exact, at most,
// or as tall as its content). And the data it shows, as fields of the object `self()` answers: in an app, each
// field is one of the app's own values (`potion.self().name`); while it is made, the sample stands in for them.

/** The kinds a field may be. */
export const FIELD_TYPES = Object.freeze(["text", "number", "date", "yes/no", "list", "group"]);

const between = (n, low, high) => Number.isInteger(n) && n >= low && n <= high;

/**
 * A room as it is kept: `{ width: { min?, max? } | null, height: { min?, max? } | null }`. Null width: as wide as its
 * place. Null height: as tall as its content. Throws, in words, on what cannot be a room.
 */
export function checkRoom(room) {
  const side = (value, what, low, high) => {
    if (value == null) return null;
    const min = value.min ?? null;
    const max = value.max ?? null;
    for (const n of [min, max]) if (n !== null && !between(n, low, high)) throw new Error(`a layout's ${what} is a whole number of pixels from ${low} to ${high}`);
    if (min === null && max === null) return null;
    if (min !== null && max !== null && min > max) throw new Error(`a layout's ${what} has a min above its max`);
    return { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) };
  };
  return { width: side(room?.width, "width", 40, 4000), height: side(room?.height, "height", 24, 6000) };
}

/** The room as a slot, so a layout is mounted, checked and described like any block in an app's place. */
export function roomSlot(room, { name = "layout", what = "the place this layout is made for" } = {}) {
  const { width, height } = checkRoom(room);
  return defineSlot({ name, what, ...(width ? { width } : {}), ...(height ? { height } : {}) });
}

/** The fields as they are kept: `[{ key, type }]`, keys that a script can read (`self().opens_at`). */
export function checkFields(fields) {
  if (fields == null) return [];
  if (!Array.isArray(fields) || fields.length > 40) throw new Error("a layout's data is a list of at most 40 fields");
  const seen = new Set();
  return fields.map((field) => {
    const key = String(field?.key ?? "").trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/.test(key)) throw new Error(`"${key}" cannot be a field: letters, digits and _, starting with a letter`);
    if (seen.has(key)) throw new Error(`the field "${key}" is there twice`);
    seen.add(key);
    if (!FIELD_TYPES.includes(field.type)) throw new Error(`"${field.type}" is not a kind of field: ${FIELD_TYPES.join(", ")}`);
    return { key, type: field.type };
  });
}

/** The fields in words, for a model and for a person: "name (text), opens (date)". */
export const fieldsText = (fields) => checkFields(fields).map((field) => `${field.key} (${field.type})`).join(", ");

/**
 * The host of a block that shows one object: `window.<name>.self()` answers it. While the block is written the
 * app answers with the draft's sample; where it is used, with the real object.
 * @param {string} name the app's name, as the block calls it (`block`, `tags`, `potion`)
 */
export const selfHost = (name) => defineHost({ name, calls: ["self"] });

const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const kindOf = (value) => {
  if (value === null || value === undefined) return "anything";
  if (typeof value === "string") return DATE.test(value) ? "date" : "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "yes or no";
  if (Array.isArray(value)) return value.length ? `list of ${kindOf(value[0])}` : "list";
  return "group";
};

/**
 * What a layout asks for, read from its sample: each value self() answers and its kind (text, date, number,
 * yes or no, list of …, group), nested ones as `a.b`. The sample is the layout's contract with the app it is
 * applied to: the app's self() answers these, and none of them is required, since a missing value is not drawn.
 * @param {unknown} sample
 * @returns {{ key: string, kind: string }[]}
 */
export function shapeOf(sample, prefix = "") {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return [];
  const fields = [];
  for (const [key, value] of Object.entries(sample)) {
    const name = `${prefix}${key}`;
    fields.push({ key: name, kind: kindOf(value) });
    if (value && typeof value === "object" && !Array.isArray(value)) fields.push(...shapeOf(value, `${name}.`));
    else if (Array.isArray(value) && value[0] && typeof value[0] === "object" && !Array.isArray(value[0])) fields.push(...shapeOf(value[0], `${name}[].`));
  }
  return fields;
}

const DRAFT_NOTE = "The draft is drawn again on the person's screen each time it is written: write it early and often, a first version at once, then step by step, rather than one perfect source at the end.";

/**
 * The tools that work on the draft. `write: true` marks the one that waits for the person's approval.
 * `parameters` is JSON Schema, for a model's function call or an MCP tool.
 */
export const DRAFT_TOOLS = Object.freeze([
  {
    name: "read_draft",
    description: "The draft as it is now: its source, name, the place it is written for, its sample data, and the block it was started from, if any. Read it before changing a draft you did not write in this conversation: the person or another agent may have changed it.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "write_draft",
    description: `Write the draft: any of the whole source (it replaces what is there), its name, its room (width and height), its fields (the data self() answers) and its sample (the made-up data it is drawn with). Give only what changes. ${DRAFT_NOTE} The answer lists what is seen wrong in the source, and advice on how it fits its room; act on both in the next write.`,
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "The whole html of the block, no ``` fence" },
        name: { type: "string", description: "What the person will call it" },
        sample: { type: "object", description: "Made-up data with the draft's fields: realistic values, never lorem ipsum. Replaces the whole sample" },
        room: {
          type: "object",
          description: "Its width and height in px. {min, max} equal: exactly; {max}: at most; null: as wide as its place, or as tall as its content",
          properties: { width: { type: ["object", "null"], properties: { min: { type: "integer" }, max: { type: "integer" } } }, height: { type: ["object", "null"], properties: { min: { type: "integer" }, max: { type: "integer" } } } },
        },
        fields: {
          type: "array",
          description: `The data the layout shows, as the fields self() answers: all of them (it replaces the list). Kinds: ${FIELD_TYPES.join(", ")}`,
          items: { type: "object", properties: { key: { type: "string" }, type: { type: "string", enum: [...FIELD_TYPES] } }, required: ["key", "type"] },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "publish_draft",
    description: "Keep the draft as a block. A draft started from a block replaces that block, unless as_new is true; any other draft becomes a new block. Only when the person asks for it: it waits for their approval.",
    write: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The block's name, when it is not the draft's" },
        as_new: { type: "boolean", description: "Keep it as a new block even when the draft was started from one" },
      },
      additionalProperties: false,
    },
  },
]);

/** Tools as a model's function calls (OpenRouter, OpenAI): `write` is the app's to know and is left out. */
export const asFunctions = (tools) => tools.map(({ name, description, parameters }) => ({ type: "function", function: { name, description, parameters } }));

/**
 * What a publish will do, in a sentence the person approves.
 * @param {{ name?: string | null, based_on?: { id: string, name: string, used_by?: number } | null }} draft
 * @param {{ name?: string, as_new?: boolean }} [args]
 */
export function publishing(draft, { name, as_new } = {}) {
  const called = name || draft.name || "Untitled";
  const base = draft.based_on;
  if (base && !as_new) {
    const used = base.used_by ? `, which ${base.used_by} ${base.used_by === 1 ? "place shows" : "places show"},` : "";
    return `Replace the block "${base.name}"${used} with this draft${called !== base.name ? `, renamed "${called}"` : ""}.`;
  }
  return `Keep this draft as a new block, "${called}".`;
}
