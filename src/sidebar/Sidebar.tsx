import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useTabsStore } from "../app/tabsStore";
import { useT } from "../i18n";

/** Distance the pointer must travel before a press turns into a reorder. */
const DRAG_THRESHOLD = 4;

/** The left rail: every open tab, terminal or settings, and how to add more. */
export function Sidebar() {
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId);
  const activate = useTabsStore((state) => state.activate);
  const openTerminal = useTabsStore((state) => state.openTerminal);
  const openSettings = useTabsStore((state) => state.openSettings);
  const close = useTabsStore((state) => state.close);
  const rename = useTabsStore((state) => state.rename);
  const reorder = useTabsStore((state) => state.reorder);
  const t = useT();

  const listRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ from: number; to: number } | null>(null);

  /**
   * Reordering runs on pointer events rather than HTML5 drag & drop: native
   * window drag-drop is enabled for file attachments, and an in-page HTML5 drag
   * becomes a system drag on GTK, which the two would fight over.
   */
  const startDrag = (event: ReactPointerEvent<HTMLElement>, from: number) => {
    if (event.button !== 0 || renaming) return;
    const startY = event.clientY;
    let moved = false;

    const onMove = (move: PointerEvent) => {
      if (!moved && Math.abs(move.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      setDragging({ from, to: indexAt(listRef.current, move.clientY, from) });
    };

    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(null);
      if (moved) reorder(from, indexAt(listRef.current, up.clientY, from));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__list" ref={listRef}>
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={[
              "sidebar__item",
              tab.id === activeId ? "sidebar__item--active" : "",
              dragging?.from === index ? "sidebar__item--dragging" : "",
              dragging && dragging.from !== index && dragging.to === index
                ? "sidebar__item--drop"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerDown={(event) => startDrag(event, index)}
            // Middle click closes a tab, the way it does in a browser.
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              void close(tab.id);
            }}
          >
            {renaming === tab.id ? (
              <input
                className="sidebar__rename"
                autoFocus
                defaultValue={tab.name}
                onBlur={(event) => {
                  rename(tab.id, event.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="sidebar__select"
                onClick={() => activate(tab.id)}
                onDoubleClick={() => setRenaming(tab.id)}
                title={tab.kind === "terminal" ? `${tab.shell} · ${tab.cwd}` : tab.name}
              >
                <span className="sidebar__icon" aria-hidden="true">
                  {tab.kind === "terminal" ? "›_" : "⚙"}
                </span>
                {tab.name}
              </button>
            )}
            <button
              type="button"
              className="sidebar__close"
              onClick={() => void close(tab.id)}
              title={t("sidebar.closeTab")}
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          className="sidebar__add"
          onClick={() => void openTerminal()}
          title={t("sidebar.newTerminal")}
        >
          +
        </button>
      </div>

      <button
        type="button"
        className="sidebar__settings"
        onClick={() => openSettings()}
        title={t("sidebar.newSettings")}
      >
        <span aria-hidden="true">⚙</span> {t("settings.title")}
      </button>
    </aside>
  );
}

/** Which position the pointer is currently over. */
function indexAt(list: HTMLElement | null, clientY: number, fallback: number): number {
  if (!list) return fallback;
  const items = Array.from(list.querySelectorAll<HTMLElement>(".sidebar__item"));
  for (const [index, item] of items.entries()) {
    const rect = item.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return Math.max(0, items.length - 1);
}
