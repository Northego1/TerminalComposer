import { useMemo } from "react";

import { useSettingsStore } from "../app/settingsStore";
import { type Language } from "./language";
import { EN, RU, type StringKey } from "./strings";

export * from "./language";

const DICTIONARIES: Record<Language, Record<StringKey, string>> = { en: EN, ru: RU };

export type { StringKey };

export type Translate = (
  key: StringKey,
  values?: Record<string, string | number>,
) => string;

export function translator(language: Language): Translate {
  const dictionary = DICTIONARIES[language] ?? EN;
  return (key, values) => {
    const template = dictionary[key];
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}

/** For components. Re-renders them when the language changes. */
export function useT(): Translate {
  const language = useSettingsStore((state) => state.settings.language);
  return useMemo(() => translator(language), [language]);
}

/** For the places that are not components -- session names, terminal output. */
export function t(key: StringKey, values?: Record<string, string | number>): string {
  return translator(useSettingsStore.getState().settings.language)(key, values);
}
