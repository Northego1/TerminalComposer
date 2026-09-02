import { create } from "zustand";

/**
 * What the main area shows. Settings are a view next to the terminals rather
 * than a dialog over them, so opening them never hides what is running.
 */
export type View = "terminals" | "settings";

interface ViewState {
  view: View;
  show: (view: View) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: "terminals",
  show: (view) => set({ view }),
}));
