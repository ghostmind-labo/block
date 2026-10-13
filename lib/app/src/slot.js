// A slot is a place of an app where a block is shown, and the room it has there: the box under the mouse on
// a map, a column beside a page, a card in a list, the whole window.
//
//     const hover = defineSlot({ name: "hover", what: "the small box shown while the mouse is over a place",
//                                width: { max: 320 }, height: { max: 360 }, shrink: true, interactive: false });
//
// The app declares its slots once. `mount` keeps a block inside the one it is shown in, and `slotText` says
// the same numbers to whoever writes the block (a tool's description, a skill), so the room a block is told it
// has and the room it gets are one fact and not two.

const size = (value, what) => {
  if (value == null) return null;
  const { min = null, max = null } = typeof value === "number" ? { min: value, max: value } : value;
  for (const n of [min, max]) if (n != null && !(Number.isFinite(n) && n > 0)) throw new Error(`a slot's ${what} is a number of pixels, or { min, max }`);
  if (min != null && max != null && min > max) throw new Error(`a slot's ${what} has a min above its max`);
  return min == null && max == null ? null : { min, max };
};

/**
 * @param {object} definition
 * @param {string} definition.name letters, digits and dashes: it is written on the block's `<html data-block-slot>`
 * @param {string} [definition.what] where this is and what it is for, in a sentence, for whoever writes a block
 * @param {number | { min?: number, max?: number }} [definition.width] pixels. Left out: the width of whatever holds the frame
 * @param {"fill" | number | { min?: number, max?: number }} [definition.height] pixels, or "fill": as tall as whatever holds the frame. Left out: as tall as the block's content
 * @param {boolean} [definition.shrink] the frame takes the width of what the block drew, up to the slot's (a box under the mouse)
 * @param {boolean} [definition.interactive] false: the block is looked at, never clicked or scrolled
 */
export function defineSlot({ name, what = "", width, height, shrink = false, interactive = true }) {
  if (!/^[a-z][a-z0-9-]*$/.test(String(name))) throw new Error(`a slot is named with lowercase letters, digits and dashes, not "${name}"`);
  const fill = height === "fill";
  return Object.freeze({ name, what: String(what), width: size(width, "width"), height: fill ? null : size(height, "height"), fill, shrink: Boolean(shrink), interactive: Boolean(interactive) });
}

const range = (one, noun) => {
  if (!one) return "";
  if (one.min != null && one.min === one.max) return `${one.min} px ${noun}`;
  if (one.min != null && one.max != null) return `${one.min} to ${one.max} px ${noun}`;
  return one.max != null ? `at most ${one.max} px ${noun}` : `at least ${one.min} px ${noun}`;
};

/**
 * The slot in words, for whoever writes a block for it.
 * @param {ReturnType<typeof defineSlot>} slot
 */
export function slotText(slot) {
  const room = [];
  if (slot.width) room.push(range(slot.width, "wide"));
  else room.push("as wide as the place it is shown in");
  if (slot.fill) room.push("as tall as the place it is shown in (vh works, and it scrolls inside itself)");
  else if (slot.height) room.push(`${range(slot.height, "tall")}${slot.height.max != null ? (slot.interactive ? ": past that it scrolls inside itself" : ": what is past that is cut off") : ""}`);
  else room.push("as tall as its content (do not use vh or height: 100%)");
  const parts = [`${slot.name}${slot.what ? `: ${slot.what}` : ""}.`, `It is ${room.join(", ")}.`];
  if (slot.shrink) parts.push("The frame takes the width of what the block draws, so give the outermost element a width.");
  if (!slot.interactive) parts.push("It is looked at, never clicked: no buttons, no links, no scrolling.");
  return parts.join(" ");
}

const clamp = (value, one, low, high) => Math.max(one?.min ?? low, Math.min(value, one?.max ?? high));

/** The height and width a frame is given for what its block reported, inside the slot. */
export function fit(slot, { height, width }) {
  return {
    height: slot?.fill ? null : clamp(height, slot?.height, 24, 6000),
    width: slot?.shrink && Number.isFinite(width) ? clamp(width, slot.width, 24, 4000) : null,
  };
}
