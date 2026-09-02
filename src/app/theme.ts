import type { ITheme } from "@xterm/xterm";

/**
 * The palette, in one place.
 *
 * Both the interface (CSS custom properties) and the terminal (xterm's theme)
 * are derived from these values, so a colour is never defined twice.
 */
export type ThemeName = "dark" | "light";

interface Palette {
  bg: string;
  bgPanel: string;
  bgElevated: string;
  border: string;
  borderActive: string;
  /** A block that reads as a surface without competing with the content. */
  surface: string;
  text: string;
  textDim: string;
  accent: string;
  /** The second stop of the mark's gradient. */
  accentDeep: string;
  /** A shell waiting for a command, which is good news rather than a warning. */
  ready: string;
  terminal: ITheme;
}

export const THEMES: Record<ThemeName, Palette> = {
  dark: {
    bg: "#0a0a0e",
    bgPanel: "#0e0e13",
    bgElevated: "#14141b",
    border: "#1e1e27",
    borderActive: "#3b4a66",
    surface: "#191921",
    text: "#dcdce2",
    textDim: "#75758a",
    accent: "#8ab4f8",
    accentDeep: "#6f8ff0",
    ready: "#6fd7a5",
    terminal: {
      background: "#0e0e13",
      foreground: "#d7d7dc",
      cursor: "#8ab4f8",
      selectionBackground: "#2f3a4d",
    },
  },
  light: {
    bg: "#f6f6f8",
    bgPanel: "#ffffff",
    bgElevated: "#ffffff",
    border: "#dcdce3",
    borderActive: "#9ab4e0",
    surface: "#e7e7ee",
    text: "#1d1d21",
    textDim: "#6b6b76",
    accent: "#1a63c8",
    accentDeep: "#1550a8",
    ready: "#1f9d63",
    terminal: {
      background: "#ffffff",
      foreground: "#1d1d21",
      cursor: "#1a63c8",
      selectionBackground: "#cfe0fb",
    },
  },
};

export function applyTheme(name: ThemeName): void {
  const palette = THEMES[name];
  const root = document.documentElement;
  root.style.setProperty("--bg", palette.bg);
  root.style.setProperty("--bg-panel", palette.bgPanel);
  root.style.setProperty("--bg-elevated", palette.bgElevated);
  root.style.setProperty("--border", palette.border);
  root.style.setProperty("--border-active", palette.borderActive);
  root.style.setProperty("--surface", palette.surface);
  root.style.setProperty("--text", palette.text);
  root.style.setProperty("--text-dim", palette.textDim);
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--accent-deep", palette.accentDeep);
  root.style.setProperty("--ready", palette.ready);
  root.style.colorScheme = name;
}
