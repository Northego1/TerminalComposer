import { useT } from "../i18n";
import { keepFocus } from "./keepFocus";
import { useTabsStore } from "./tabsStore";

/**
 * Splitting the tab with the mouse, since until now only the keyboard could.
 *
 * They sit in the header beside the window buttons, where a terminal keeps the
 * things it does to itself rather than to what is running inside it. Each one
 * does exactly what its shortcut does, and says so.
 */
export function SplitControls() {
  const t = useT();
  const split = useTabsStore((state) => state.split);

  return (
    <div className="split-controls">
      <button
        type="button"
        className="split-controls__button"
        {...keepFocus}
        onClick={() => void split("row")}
        title={t("split.right")}
        aria-label={t("split.right")}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
          <rect
            x="1"
            y="1.5"
            width="11"
            height="10"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M6.5 1.5v10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

      <button
        type="button"
        className="split-controls__button"
        {...keepFocus}
        onClick={() => void split("column")}
        title={t("split.down")}
        aria-label={t("split.down")}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
          <rect
            x="1"
            y="1.5"
            width="11"
            height="10"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M1 6.5h11" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
