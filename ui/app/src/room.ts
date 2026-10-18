import { roomSlot, type Slot } from "@ghostmind-dev/block";
import type { Room } from "./api";

// A layout's room: the width and height set by the person, in words and as a slot. Shared by the layouts page and
// the embed page.

const side = (value: Room["width"], noun: string, none: string) => {
  if (!value) return none;
  if (value.min && value.min === value.max) return `${value.min} px ${noun}`;
  return `at most ${value.max} px ${noun}`;
};
export const roomText = (room: Room) => `${side(room.width, "wide", "full width")} · ${side(room.height, "tall", "as tall as its content")}`;

/**
 * The place a layout is drawn in: its own room, or the app's slot of a block made before rooms. One slot per room:
 * the frame is made again when its slot changes, so a new object on each render would make it again and again.
 */
const roomSlots = new Map<string, Slot>();
export function slotFor(layout: { room?: Room | null; slot: string }, slots: Slot[]): Slot {
  const room = roomOf(layout, slots);
  const key = JSON.stringify(room);
  if (!roomSlots.has(key)) roomSlots.set(key, roomSlot(room));
  return roomSlots.get(key)!;
}

/** A layout's room: its own, or, for a block made for one of the app's places before rooms, that place's size. */
export function roomOf(layout: { room?: Room | null; slot: string }, slots: Slot[]): Room {
  if (layout.room) return layout.room;
  const slot = slots.find((each) => each.name === layout.slot);
  if (!slot) return { width: null, height: null };
  const side = (size: Slot["width"]) => (size ? { ...(size.min != null ? { min: size.min } : {}), ...(size.max != null ? { max: size.max } : {}) } : null);
  // a place that filled its window is given a window's height here
  return { width: side(slot.width), height: slot.fill ? { min: 600, max: 600 } : side(slot.height) };
}

