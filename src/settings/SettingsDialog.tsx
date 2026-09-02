import { useEffect } from "react";

import { useSettingsStore, type Settings } from "../app/settingsStore";

interface SettingsDialogProps {
  onClose: () => void;
}

const FONT_FAMILIES = [
  {
    label: "Системный моноширинный",
    value:
      'ui-monospace, "JetBrains Mono", "Fira Code", "DejaVu Sans Mono", monospace',
  },
  { label: "DejaVu Sans Mono", value: '"DejaVu Sans Mono", monospace' },
  { label: "Ubuntu Mono", value: '"Ubuntu Mono", monospace' },
  { label: "Liberation Mono", value: '"Liberation Mono", monospace' },
];

/** Everything the user can change. Each edit is applied and saved at once. */
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    update({ [key]: value } as Partial<Settings>);

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <span>Настройки</span>
          <button type="button" onClick={onClose} title="Закрыть (Esc)">
            ×
          </button>
        </header>

        <div className="settings">
          <label className="settings__row">
            <span>Тема</span>
            <select
              value={settings.theme}
              onChange={(event) => set("theme", event.target.value as Settings["theme"])}
            >
              <option value="dark">Тёмная</option>
              <option value="light">Светлая</option>
            </select>
          </label>

          <label className="settings__row">
            <span>Шрифт терминала</span>
            <select
              value={settings.fontFamily}
              onChange={(event) => set("fontFamily", event.target.value)}
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font.label} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings__row">
            <span>Размер шрифта</span>
            <input
              type="number"
              min={8}
              max={32}
              value={settings.fontSize}
              onChange={(event) => set("fontSize", clamp(event.target.value, 8, 32, 13))}
            />
          </label>

          <label className="settings__row">
            <span>Глубина scrollback, строк</span>
            <input
              type="number"
              min={100}
              max={200_000}
              step={1000}
              value={settings.scrollback}
              onChange={(event) =>
                set("scrollback", clamp(event.target.value, 100, 200_000, 10_000))
              }
            />
          </label>

          <label className="settings__row">
            <span>Макс. высота composer, % окна</span>
            <input
              type="number"
              min={20}
              max={80}
              value={settings.composerMaxHeight}
              onChange={(event) =>
                set("composerMaxHeight", clamp(event.target.value, 20, 80, 40))
              }
            />
          </label>

          <label className="settings__row">
            <span>Shell для новых вкладок</span>
            <input
              type="text"
              placeholder="$SHELL"
              value={settings.shell}
              onChange={(event) => set("shell", event.target.value)}
            />
          </label>

          <label className="settings__row">
            <span>Каталог для новых вкладок</span>
            <input
              type="text"
              placeholder="домашний каталог"
              value={settings.cwd}
              onChange={(event) => set("cwd", event.target.value)}
            />
          </label>
        </div>

        <p className="settings__note">
          Shell и каталог применяются к новым вкладкам. Остальное — сразу ко всем.
        </p>
      </div>
    </div>
  );
}

function clamp(raw: string, min: number, max: number, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}
