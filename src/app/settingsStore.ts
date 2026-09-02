import { getCurrentWebview } from "@tauri-apps/api/webview";
import { create } from "zustand";

import { detectLanguage, type Language } from "../i18n/language";
import { readDocument, writeDocument } from "./persistence";
import { applyTheme, type ThemeName } from "./theme";

export interface Settings {
  language: Language;
  theme: ThemeName;
  fontFamily: string;
  fontSize: number;
  /**
   * Scale of the whole window, in percent.
   *
   * Not the terminal's font size, which is a separate setting: this magnifies
   * the interface with it -- tabs, the composer, the viewer -- the way a
   * browser's zoom does, because a display that needs bigger type needs it
   * everywhere.
   */
  zoom: number;
  scrollback: number;
  /** How much of the window the composer may grow to, in percent. */
  composerMaxHeight: number;
  /** Shell for new terminals; empty means `$SHELL`. */
  shell: string;
  /** Working directory for new terminals; empty means the home directory. */
  cwd: string;
  /**
   * Load the shell integration in new terminals.
   *
   * With it the shell reports whether it is waiting for a command or running
   * one, which is what decides where the keyboard goes. Without it nothing is
   * guessed -- the composer is simply opened by hand.
   */
  shellIntegration: boolean;
  /**
   * Let Claude Code report its own lifecycle.
   *
   * On by default: without it a tab cannot say that the agent in it is waiting,
   * and there is no other way to know. Turning it off removes the hooks again.
   */
  agentHooks: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  theme: "dark",
  fontFamily:
    'ui-monospace, "JetBrains Mono", "Fira Code", "DejaVu Sans Mono", monospace',
  fontSize: 13,
  zoom: 100,
  scrollback: 10_000,
  composerMaxHeight: 40,
  shell: "",
  cwd: "",
  shellIntegration: true,
  agentHooks: true,
};

interface SettingsState {
  settings: Settings;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,

  load: async () => {
    const stored = await readDocument<Partial<Settings>>("settings");
    // Unknown or missing fields fall back to the defaults, so an older file
    // keeps working after a setting is added. English is the base language;
    // the system's is only a first-run suggestion.
    set({
      settings: {
        ...DEFAULT_SETTINGS,
        language: detectLanguage(),
        ...stored,
      },
    });
  },

  update: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void writeDocument("settings", settings);
  },
}));

/** Applies everything a setting change means outside React. */
export function applySettingsToDocument(settings: Settings): void {
  applyTheme(settings.theme);
  // The webview's own scale, so everything drawn in it follows -- including the
  // terminal, which draws its glyphs itself and would ignore a CSS transform.
  void getCurrentWebview()
    .setZoom(settings.zoom / 100)
    .catch(() => {});
  // The composer's command line is drawn with these, so it matches the
  // terminal instead of merely being monospace too.
  document.documentElement.style.setProperty("--term-font-family", settings.fontFamily);
  document.documentElement.style.setProperty("--term-font-size", `${settings.fontSize}px`);
  document.documentElement.style.setProperty(
    "--composer-max-height",
    `${settings.composerMaxHeight}vh`,
  );
}
