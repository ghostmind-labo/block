/**
 * The options block gives @ghostmind-dev/colors, read by vite.config.ts (the stylesheet and pre-paint script
 * written into index.html) and by the page (the theme picker). Plain data.
 *
 * `system` (light or dark from the system until a theme is picked) arrives after 0.2.1: 0.2.1 ignores it and
 * shows Light until one is picked. Not typed as ColorsOptions so that it compiles against either version.
 */
export const COLORS_OPTIONS = {
  themes: true,
  own: "light",
  system: { light: "light", dark: "dark" },
};

/** dev only: this browser's choice of on or off, over COLORS_PACKAGE. */
export const COLORS_OVERRIDE_KEY = "colors";
