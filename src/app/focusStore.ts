import { create } from "zustand";

/**
 * Explicit focus model (risk #4 in the spec).
 *
 * xterm.js and the composer both want the keyboard, so exactly one of them is
 * "the active pane" at any time and the app drives DOM focus from that single
 * value -- never the other way round.
 *
 * Transitions:
 *   - the app starts with the composer active;
 *   - a mouse press inside a pane activates it;
 *   - Escape in the composer jumps to the terminal;
 *   - Ctrl+Shift+Up opens the composer, Ctrl+Shift+Down puts it away;
 *   - submitting a message keeps the composer active.
 *
 * The pane-switch keys are handled on the capture phase (see `useFocusHotkeys`)
 * so neither xterm.js nor the editor ever sees them.
 */
export type Pane = "terminal" | "composer";

interface FocusState {
  pane: Pane;
  focusPane: (pane: Pane) => void;
  togglePane: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  pane: "composer",
  focusPane: (pane) => set({ pane }),
  togglePane: () =>
    set((state) => ({
      pane: state.pane === "composer" ? "terminal" : "composer",
    })),
}));
