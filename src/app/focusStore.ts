import { create } from "zustand";

/**
 * Explicit focus model (risk #4 in the spec).
 *
 * xterm.js and the composer both want the keyboard, so exactly one of them is
 * "the active pane" at any time and the app drives DOM focus from that single
 * value -- never the other way round.
 *
 * Transitions:
 *   - the shell says whether it is waiting for a command or running one, and
 *     the keyboard follows that;
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
  /**
   * The composer keeps the keyboard, whatever anything else reports.
   *
   * The shell can only speak for itself: inside `docker exec`, `ssh`, `tmux` or
   * a nested shell it sees one command running and nothing more, so nothing
   * ever says the inner prompt is waiting. Rather than guess at that, this is
   * the switch that says so outright.
   */
  pinned: boolean;
  focusPane: (pane: Pane) => void;
  /** Moves the keyboard unless the composer has been pinned. */
  suggestPane: (pane: Pane) => void;
  togglePane: () => void;
  togglePinned: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  // The terminal starts with it. With the shell integration the first prompt
  // hands it to the composer straight away; without, it stays here and the
  // composer is opened by hand -- nothing is ever guessed.
  pane: "terminal",
  pinned: false,
  focusPane: (pane) => set({ pane }),

  suggestPane: (pane) =>
    set((state) => (state.pinned ? state : { pane })),

  togglePinned: () =>
    set((state) => ({ pinned: !state.pinned, pane: state.pinned ? state.pane : "composer" })),
  togglePane: () =>
    set((state) => ({
      pane: state.pane === "composer" ? "terminal" : "composer",
    })),
}));
