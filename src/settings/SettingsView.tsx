import { useState } from "react";

import { useSettingsStore, type Settings } from "../app/settingsStore";
import { LANGUAGE_NAMES, LANGUAGES, useT, type StringKey } from "../i18n";
import { NumberField } from "./NumberField";

type Tab = "general" | "terminal" | "composer";

const TABS: Array<{ id: Tab; label: StringKey }> = [
  { id: "general", label: "settings.tab.general" },
  { id: "terminal", label: "settings.tab.terminal" },
  { id: "composer", label: "settings.tab.composer" },
];

const FONT_FAMILIES = [
  {
    label: "settings.fontFamily.system" as StringKey,
    value:
      'ui-monospace, "JetBrains Mono", "Fira Code", "DejaVu Sans Mono", monospace',
  },
  { label: null, value: '"DejaVu Sans Mono", monospace', name: "DejaVu Sans Mono" },
  { label: null, value: '"Ubuntu Mono", monospace', name: "Ubuntu Mono" },
  { label: null, value: '"Liberation Mono", monospace', name: "Liberation Mono" },
];

/** Settings as a view of their own, grouped by topic. Each edit saves at once. */
export function SettingsView() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const [tab, setTab] = useState<Tab>("general");
  const t = useT();

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    update({ [key]: value } as Partial<Settings>);

  return (
    <section className="settings-view">
      <header className="settings-view__header">
        <h1 className="settings-view__title">{t("settings.title")}</h1>
        <nav className="settings-view__tabs">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`settings-view__tab${
                tab === entry.id ? " settings-view__tab--active" : ""
              }`}
              onClick={() => setTab(entry.id)}
            >
              {t(entry.label)}
            </button>
          ))}
        </nav>
      </header>

      <div className="settings-view__body">
        {tab === "general" && (
          <div className="settings">
            <label className="settings__row">
              <span>{t("settings.language")}</span>
              <select
                value={settings.language}
                onChange={(event) =>
                  set("language", event.target.value as Settings["language"])
                }
              >
                {LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {LANGUAGE_NAMES[language]}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings__row">
              <span>{t("settings.theme")}</span>
              <select
                value={settings.theme}
                onChange={(event) =>
                  set("theme", event.target.value as Settings["theme"])
                }
              >
                <option value="dark">{t("settings.theme.dark")}</option>
                <option value="light">{t("settings.theme.light")}</option>
              </select>
            </label>
          </div>
        )}

        {tab === "terminal" && (
          <div className="settings">
            <label className="settings__row">
              <span>{t("settings.fontFamily")}</span>
              <select
                value={settings.fontFamily}
                onChange={(event) => set("fontFamily", event.target.value)}
              >
                {FONT_FAMILIES.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label ? t(font.label) : font.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="settings__row">
              <span>{t("settings.fontSize")}</span>
              <NumberField
                value={settings.fontSize}
                min={8}
                max={32}
                onChange={(value) => set("fontSize", value)}
              />
            </div>

            <div className="settings__row">
              <span>{t("settings.scrollback")}</span>
              <NumberField
                value={settings.scrollback}
                min={100}
                max={200_000}
                step={1000}
                onChange={(value) => set("scrollback", value)}
              />
            </div>

            <label className="settings__row">
              <span>{t("settings.shellIntegration")}</span>
              <input
                type="checkbox"
                className="settings__toggle"
                checked={settings.shellIntegration}
                onChange={(event) => set("shellIntegration", event.target.checked)}
              />
            </label>

            <label className="settings__row">
              <span>{t("settings.shell")}</span>
              <input
                type="text"
                placeholder={t("settings.shell.placeholder")}
                value={settings.shell}
                onChange={(event) => set("shell", event.target.value)}
              />
            </label>

            <label className="settings__row">
              <span>{t("settings.cwd")}</span>
              <input
                type="text"
                placeholder={t("settings.cwd.placeholder")}
                value={settings.cwd}
                onChange={(event) => set("cwd", event.target.value)}
              />
            </label>

            <p className="settings__note">{t("settings.shellIntegration.note")}</p>
            <p className="settings__note">{t("settings.note.terminal")}</p>
          </div>
        )}

        {tab === "composer" && (
          <div className="settings">
            <div className="settings__row">
              <span>{t("settings.composerMaxHeight")}</span>
              <NumberField
                value={settings.composerMaxHeight}
                min={20}
                max={80}
                step={5}
                onChange={(value) => set("composerMaxHeight", value)}
              />
            </div>

            <p className="settings__note">{t("settings.note.composer")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
