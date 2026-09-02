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
  text: string;
  textDim: string;
  accent: string;
  terminal: ITheme;
}

export const THEMES: Record<ThemeName, Palette> = {
  dark: {
    bg: "#0b0b0f",
    bgPanel: "#101014",
    bgElevated: "#16161c",
    border: "#26262f",
    borderActive: "#3d4a63",
    text: "#d7d7dc",
    textDim: "#7c7c8a",
    accent: "#8ab4f8",
    terminal: {
      background: "#101014",
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
    text: "#1d1d21",
    textDim: "#6b6b76",
    accent: "#1a63c8",
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
  root.style.setProperty("--text", palette.text);
  root.style.setProperty("--text-dim", palette.textDim);
  root.style.setProperty("--accent", palette.accent);
  root.style.colorScheme = name;
}
