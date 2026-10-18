import { defineSlot, type Slot } from "@ghostmind-dev/block";

/**
 * The places this app shows a block in. Each stands for a place one of the apps has (a note in Potion, the box
 * under the mouse and the panel beside the map in Tags, a dashboard and its cover in Relay), so a block can
 * be tried here in the room it will have there. The web app reads this list from /api/slots and gives the
 * very same objects to `mount`: the room a block is told it has and the room it gets are one fact.
 */
export const SLOTS: Slot[] = [
  defineSlot({ name: "page", what: "a page of its own: the block is the window (a dashboard, a small site, a game)", height: "fill" }),
  defineSlot({ name: "note", what: "inline in a column of text, between two paragraphs (a chart or a widget in a note)", width: { max: 720 } }),
  defineSlot({ name: "panel", what: "a narrow panel beside something else (the details of a place beside a map)", width: { min: 260, max: 520 } }),
  defineSlot({ name: "hover", what: "the small box shown while the mouse is over something (a place on a map)", width: { max: 320 }, height: { max: 360 }, shrink: true, interactive: false }),
  defineSlot({ name: "card", what: "a cover in a list of covers, which stands for something that opens elsewhere", width: 300, height: 200, interactive: false }),
];

export const DEFAULT_SLOT = "page";
export const SLOT_NAMES = SLOTS.map((slot) => slot.name) as [string, ...string[]];
export const slotNamed = (name: string) => SLOTS.find((slot) => slot.name === name);

