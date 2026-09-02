import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { keepFocus } from "../app/keepFocus";
import type { AgentState } from "../agent/events";
import { useTabsStore, type Tab } from "../app/tabsStore";
import { useT, type Translate } from "../i18n";

/** Distance the pointer must travel before a press turns into a reorder. */
const DRAG_THRESHOLD = 4;

/**
 * The left rail: every open tab, terminal or settings, and how to add more.
 *
 * Terminals sit above the new-terminal button and settings below it, so the
 * button doubles as the divider between the two kinds. Reordering therefore
 * happens within a group -- a settings tab cannot be dragged in among the
 * terminals, because that is not a position it can be shown in.
 */
export function Sidebar() {
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId);
  const openTerminal = useTabsStore((state) => state.openTerminal);
  const openSettings = useTabsStore((state) => state.openSettings);
  const reorder = useTabsStore((state) => state.reorder);
  const agents = useTabsStore((state) => state.agents);
  const t = useT();

  const listRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; overId: string } | null>(null);

  const groups = {
    terminal: tabs.filter((tab) => tab.kind === "terminal"),
    settings: tabs.filter((tab) => tab.kind === "settings"),
  };

  /**
   * Reordering runs on pointer events rather than HTML5 drag & drop: native
   * window drag-drop is enabled for file attachments, and an in-page HTML5 drag
   * becomes a system drag on GTK, which the two would fight over.
   */
  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    kind: Tab["kind"],
    index: number,
  ) => {
    if (event.button !== 0 || renaming) return;
    const group = groups[kind];
    const startY = event.clientY;
    let moved = false;

    const targetOf = (clientY: number) =>
      group[indexAt(listRef.current, kind, clientY, index)];

    const onMove = (move: PointerEvent) => {
      if (!moved && Math.abs(move.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      setDragging({ id: group[index].id, overId: targetOf(move.clientY).id });
    };

    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(null);
      if (!moved) return;
      const from = tabs.indexOf(group[index]);
      const to = tabs.indexOf(targetOf(up.clientY));
      if (from >= 0 && to >= 0) reorder(from, to);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const rows = (kind: Tab["kind"]) =>
    groups[kind].map((tab, index) => (
      <TabRow
        key={tab.id}
        tab={tab}
        active={tab.id === activeId}
        dragged={dragging?.id === tab.id}
        dropTarget={Boolean(dragging && dragging.id !== tab.id && dragging.overId === tab.id)}
        agent={agents[tab.id]}
        renaming={renaming === tab.id}
        onStartRename={() => setRenaming(tab.id)}
        onFinishRename={() => setRenaming(null)}
        onPointerDown={(event) => startDrag(event, kind, index)}
        t={t}
      />
    ));

  return (
    <aside className="sidebar">
      <div className="sidebar__list" ref={listRef}>
        <div className="sidebar__group" data-group="terminal">
          {rows("terminal")}
        </div>

        <button
          type="button"
          className="sidebar__add"
          {...keepFocus}
          onClick={() => void openTerminal()}
          title={t("sidebar.newTerminal")}
        >
          +
        </button>

        <div className="sidebar__group" data-group="settings">
          {rows("settings")}
        </div>
      </div>

      <button
        type="button"
        className="sidebar__settings"
        {...keepFocus}
        onClick={() => openSettings()}
        title={t("sidebar.newSettings")}
      >
        <span aria-hidden="true">⚙</span> {t("settings.title")}
      </button>
    </aside>
  );
}

interface TabRowProps {
  tab: Tab;
  active: boolean;
  agent?: AgentState;
  dragged: boolean;
  dropTarget: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onFinishRename: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  t: Translate;
}

function TabRow({
  tab,
  active,
  agent,
  dragged,
  dropTarget,
  renaming,
  onStartRename,
  onFinishRename,
  onPointerDown,
  t,
}: TabRowProps) {
  const activate = useTabsStore((state) => state.activate);
  const close = useTabsStore((state) => state.close);
  const rename = useTabsStore((state) => state.rename);

  return (
    <div
      className={[
        "sidebar__item",
        active ? "sidebar__item--active" : "",
        dragged ? "sidebar__item--dragging" : "",
        dropTarget ? "sidebar__item--drop" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={onPointerDown}
      // Middle click closes a tab, the way it does in a browser.
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        void close(tab.id);
      }}
    >
      {renaming ? (
        <input
          className="sidebar__rename"
          autoFocus
          defaultValue={tab.name}
          onBlur={(event) => {
            rename(tab.id, event.target.value);
            onFinishRename();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") onFinishRename();
          }}
        />
      ) : (
        <button
          type="button"
          className="sidebar__select"
          onClick={() => activate(tab.id)}
          onDoubleClick={onStartRename}
          title={tab.kind === "terminal" ? `${tab.shell} · ${tab.cwd}` : tab.name}
        >
          <span className="sidebar__icon" aria-hidden="true">
            {tab.kind === "terminal" ? "›_" : "⚙"}
          </span>
          {tab.name}
          {agent && agent !== "working" && (
            <span
              className={`sidebar__agent sidebar__agent--${agent}`}
              title={t(
                agent === "attention" ? "sidebar.agent.attention" : "sidebar.agent.waiting",
              )}
            />
          )}
        </button>
      )}
      <button
        type="button"
        className="sidebar__close"
        {...keepFocus}
        onClick={() => void close(tab.id)}
        title={t("sidebar.closeTab")}
      >
        ×
      </button>
    </div>
  );
}

/** Which position within a group the pointer is currently over. */
function indexAt(
  list: HTMLElement | null,
  kind: Tab["kind"],
  clientY: number,
  fallback: number,
): number {
  const items = list?.querySelectorAll<HTMLElement>(
    `[data-group="${kind}"] .sidebar__item`,
  );
  if (!items?.length) return fallback;
  for (const [index, item] of Array.from(items).entries()) {
    const rect = item.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return items.length - 1;
}
