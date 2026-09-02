/** Kept free of imports so both the settings store and the dictionary can use it. */
export type Language = "en" | "ru";

export const LANGUAGES: Language[] = ["en", "ru"];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  ru: "Русский",
};

/** The language to offer on a first run, guessed from the system. */
export function detectLanguage(): Language {
  const preferred =
    typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  return preferred.startsWith("ru") ? "ru" : "en";
}
