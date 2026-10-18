import { instructions } from "@ghostmind-dev/block";
import { SLOTS } from "./slots.ts";

/** What a block is, for whoever writes one: the package's rules and this app's slots, given by the tools that take a source. */
export const CONTRACT = `THE CONTRACT\n${instructions({ slots: SLOTS })}`;
