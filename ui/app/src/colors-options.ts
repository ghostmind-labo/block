/**
 * The options block gives @ghostmind-dev/colors, read by vite.config.ts (the stylesheet and pre-paint script
 * written into index.html) and by the page (the theme picker). Plain data.
 * `system`: light or dark from the system until a theme is picked (from 0.3.0).
 */
import type { ColorsOptions } from "@ghostmind-dev/colors/app";

export const COLORS_OPTIONS: ColorsOptions = {
  themes: true,
  own: "light",
  system: { light: "light", dark: "dark" },
};

/** dev only: this browser's choice of on or off, over COLORS_PACKAGE. */
export const COLORS_OVERRIDE_KEY = "colors";
