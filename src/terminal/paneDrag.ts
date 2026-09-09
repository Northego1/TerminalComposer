import { create } from "zustand";

import { getInstance, useTabsStore } from "../app/tabsStore";
import { neighbour, sideOf, type Direction, type PaneBox } from "./neighbour";
import type { Side } from "../app/layout";

/**
 * A shell being dragged to another place in its tab.
 *
 * Pointer events rather than HTML5 drag and drop, for the same reason the rail
 * reorders that way: an in-page HTML5 drag becomes a system drag on GTK, and
 * the window already accepts dropped files.
 *
 * Only the drag is here. What it does to the layout is the store's, and where
 * the panes are is the screen's -- read from the terminals themselves, since
 * they are the boxes the user is aiming at.
 */
interface PaneDrag {
  /** The shell being dragged, or null when nothing is. */
  dragging: string | null;
  /** Where it would land: another shell and the side of it. */
  target: { id: string; side: Side } | null;
  start: (paneId: string) => void;
  over: (x: number, y: number) => void;
  drop: () => void;
}

export const usePaneDrag = create<PaneDrag>((set, get) => ({
  dragging: null,
  target: null,

  start: (paneId) => set({ dragging: paneId, target: null }),

  over: (x, y) => {
    const { dragging } = get();
    if (!dragging) return;
    const under = paneAt(x, y);
    // Over itself, or over nothing: there is nowhere to land.
    if (!under || under.id === dragging) {
      if (get().target) set({ target: null });
      return;
    }
    const side = sideOf(under.box, x, y);
    const { target } = get();
    if (target?.id === under.id && target.side === side) return;
    set({ target: { id: under.id, side } });
  },

  drop: () => {
    const { dragging, target } = get();
    set({ dragging: null, target: null });
    if (!dragging || !target) return;
    useTabsStore.getState().movePane(dragging, target.id, target.side);
    useTabsStore.getState().focusPane(dragging);
  },
}));

/** The shells of the tab on screen, as the boxes they occupy. */
export function paneBoxes(paneIds: string[]): PaneBox[] {
  return paneIds.flatMap((id) => {
    const element = getInstance(id)?.element;
    if (!element) return [];
    const { left, top, right, bottom } = element.getBoundingClientRect();
    return [{ id, box: { left, top, right, bottom } }];
  });
}

/**
 * The shell in the given direction from the one that has the keyboard, if
 * there is one.
 */
export function paneToward(direction: Direction): string | null {
  const { tabs, activeId } = useTabsStore.getState();
  const tab = tabs.find((each) => each.id === activeId);
  if (tab?.kind !== "terminal" || tab.panes.length < 2) return null;
  return neighbour(
    paneBoxes(tab.panes.map((pane) => pane.id)),
    tab.paneId,
    direction,
  );
}

function paneAt(x: number, y: number): PaneBox | null {
  const element = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-pane]");
  const id = element?.dataset.pane;
  if (!element || !id) return null;
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { id, box: { left, top, right, bottom } };
}
