import { getCurrentWindow } from "@tauri-apps/api/window";

import { useT } from "../i18n";
import { keepFocus } from "./keepFocus";

/**
 * Minimise, maximise and close, since the window has no frame of its own.
 *
 * Dragging and the double-click that maximises are handled by the header
 * itself, which carries Tauri's drag region -- these are only the buttons the
 * frame would otherwise have drawn.
 */
export function WindowControls() {
  const t = useT();
  const window = getCurrentWindow();

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-controls__button"
        {...keepFocus}
        onClick={() => void window.minimize()}
        title={t("window.minimize")}
        aria-label={t("window.minimize")}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

      <button
        type="button"
        className="window-controls__button"
        {...keepFocus}
        onClick={() => void window.toggleMaximize()}
        title={t("window.maximize")}
        aria-label={t("window.maximize")}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="1.4" y="1.4" width="7.2" height="7.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

      <button
        type="button"
        className="window-controls__button window-controls__button--close"
        {...keepFocus}
        onClick={() => void window.close()}
        title={t("window.close")}
        aria-label={t("window.close")}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.6 1.6l6.8 6.8M8.4 1.6l-6.8 6.8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
