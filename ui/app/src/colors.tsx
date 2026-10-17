/**
 * @ghostmind-dev/colors on the page (COLORS_PACKAGE, ui/.env.schema). index.html already holds the package's
 * stylesheet and has set <html data-colors="package|block"> and data-theme before the first paint (vite.config.ts);
 * this is the picker in the header and, in dev, the pill that flips one browser.
 */
import { createColors } from "@ghostmind-dev/colors/app";
import { THEME_STORAGE_KEY } from "@ghostmind-dev/colors";
import { useState } from "react";
import { COLORS_OPTIONS, COLORS_OVERRIDE_KEY } from "./colors-options";

declare const __COLORS_DEV__: boolean;

/** Whether this page runs on the package, as the script in index.html decided. */
export const fromPackage = () => document.documentElement.dataset.colors === "package";

let colors: ReturnType<typeof createColors> | undefined;
const theColors = () => (colors ??= createColors(COLORS_OPTIONS));

const SYSTEM = "";

/** The theme picker: only when the page runs on the package. "System" forgets the saved choice. */
export function ThemePicker() {
  const [saved, setSaved] = useState<string>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) ?? SYSTEM;
    } catch {
      return SYSTEM;
    }
  });
  if (!fromPackage()) return null;
  const all = theColors();
  const choose = (id: string) => {
    try {
      if (id === SYSTEM) localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* the choice then lasts until the page is reloaded */
    }
    all.apply(id === SYSTEM ? null : id);
    setSaved(id);
  };
  return (
    <select aria-label="Theme" value={all.list().some((t) => t.id === saved) ? saved : SYSTEM} onChange={(event) => choose(event.target.value)}>
      <option value={SYSTEM}>System</option>
      {all.list().map((theme) => (
        <option key={theme.id} value={theme.id}>
          {theme.name}
        </option>
      ))}
    </select>
  );
}

/** Dev only: where this page's colours come from, and a one-click flip for this browser. */
export function ColorsSwitch() {
  if (!__COLORS_DEV__) return null;
  const on = fromPackage();
  const flip = (mode: "on" | "off") => {
    try {
      localStorage.setItem(COLORS_OVERRIDE_KEY, mode);
    } catch {
      /* no storage: the reload shows COLORS_PACKAGE's choice */
    }
    // Always a full reload: the stylesheet and data-theme are set by index.html before the first paint, and
    // changing them under a running page left it blank.
    location.reload();
  };
  const side = (label: string, active: boolean, mode: "on" | "off") => (
    <button
      type="button"
      onClick={() => !active && flip(mode)}
      aria-pressed={active}
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        border: 0,
        cursor: active ? "default" : "pointer",
        background: active ? "#f59e0b" : "transparent",
        color: active ? "#1c1917" : "#e7e5e4",
        font: "600 11px/16px system-ui, sans-serif",
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      title="Dev only: where this page's colours come from"
      style={{
        position: "fixed", top: 6, left: "50%", transform: "translateX(-50%)", zIndex: 2147483647,
        display: "flex", gap: 2, padding: 2, borderRadius: 999, background: "#1c1917ee",
        boxShadow: "0 1px 4px #0006", border: "1px solid #f59e0b",
      }}
    >
      {side("block", !on, "off")}
      {side("colors pkg", on, "on")}
    </div>
  );
}
