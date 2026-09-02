import { create } from "zustand";

import { detectLanguage, type Language } from "../i18n/language";
import { readDocument, writeDocument } from "./persistence";
import { applyTheme, type ThemeName } from "./theme";

export interface Settings {
  language: Language;
  theme: ThemeName;
  fontFamily: string;
  fontSize: number;
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
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  theme: "dark",
  fontFamily:
    'ui-monospace, "JetBrains Mono", "Fira Code", "DejaVu Sans Mono", monospace',
  fontSize: 13,
  scrollback: 10_000,
  composerMaxHeight: 40,
  shell: "",
  cwd: "",
  shellIntegration: true,
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
  document.documentElement.style.setProperty(
    "--composer-max-height",
    `${settings.composerMaxHeight}vh`,
  );
}
