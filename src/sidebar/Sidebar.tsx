import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useSessionsStore } from "../app/sessionsStore";

/** Distance the pointer must travel before a press turns into a reorder. */
const DRAG_THRESHOLD = 4;

interface SidebarProps {
  onOpenSettings: () => void;
}

/** The list of open terminals: opening, switching, renaming, reordering, closing. */
export function Sidebar({ onOpenSettings }: SidebarProps) {
  const sessions = useSessionsStore((state) => state.sessions);
  const activeId = useSessionsStore((state) => state.activeId);
  const activate = useSessionsStore((state) => state.activate);
  const open = useSessionsStore((state) => state.open);
  const close = useSessionsStore((state) => state.close);
  const rename = useSessionsStore((state) => state.rename);
  const reorder = useSessionsStore((state) => state.reorder);

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
        {sessions.map((session, index) => (
          <div
            key={session.id}
            className={[
              "sidebar__item",
              session.id === activeId ? "sidebar__item--active" : "",
              dragging?.from === index ? "sidebar__item--dragging" : "",
              dragging && dragging.from !== index && dragging.to === index
                ? "sidebar__item--drop"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerDown={(event) => startDrag(event, index)}
          >
            {renaming === session.id ? (
              <input
                className="sidebar__rename"
                autoFocus
                defaultValue={session.name}
                onBlur={(event) => {
                  rename(session.id, event.target.value);
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
                onClick={() => activate(session.id)}
                onDoubleClick={() => setRenaming(session.id)}
                title={`${session.shell} · ${session.cwd}`}
              >
                {session.name}
              </button>
            )}
            <button
              type="button"
              className="sidebar__close"
              onClick={() => void close(session.id)}
              title="Закрыть терминал"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          className="sidebar__add"
          onClick={() => void open()}
          title="Новый терминал (Ctrl+Shift+T)"
        >
          +
        </button>
      </div>

      <button
        type="button"
        className="sidebar__settings"
        onClick={onOpenSettings}
        title="Настройки"
      >
        ⚙ Настройки
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
