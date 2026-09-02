import { create } from "zustand";

import type { AgentState } from "../agent/events";
import { t } from "../i18n";
import { TerminalInstance } from "../terminal/TerminalInstance";
import { useSettingsStore } from "./settingsStore";

/**
 * The left rail lists tabs, and a tab is either a terminal or a settings page.
 * Settings being a tab rather than a dialog means it opens as many times as the
 * user wants and closes exactly like everything else.
 */
export interface TerminalTab {
  kind: "terminal";
  id: string;
  name: string;
  cwd: string;
  shell: string;
}

export interface SettingsTab {
  kind: "settings";
  id: string;
  name: string;
}

export type Tab = TerminalTab | SettingsTab;

/**
 * Live terminals are kept here rather than in the store: each one owns a DOM
 * element and a PTY, so it is a resource, not state. The store holds the
 * listing, and this map is how a component gets from an id to the real thing.
 */
const instances = new Map<string, TerminalInstance>();

export function getInstance(id: string | null): TerminalInstance | null {
  return id ? (instances.get(id) ?? null) : null;
}

export function forEachInstance(visit: (instance: TerminalInstance) => void): void {
  instances.forEach(visit);
}

let openedTerminals = 0;
let openedSettings = 0;

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  error: string | null;
  /** What the agent in each terminal is doing, when one reports it. */
  agents: Record<string, AgentState>;
  setAgentState: (sessionId: string, state: AgentState) => void;
  openTerminal: (spawn?: { cwd?: string; name?: string }) => Promise<string | null>;
  openSettings: (name?: string) => void;
  restore: (
    saved: Array<{ kind: Tab["kind"]; name: string; cwd?: string }>,
    activeIndex: number,
    onOpen?: (id: string, index: number) => void,
  ) => Promise<void>;
  close: (id: string) => Promise<void>;
  activate: (id: string) => void;
  rename: (id: string, name: string) => void;
  reorder: (from: number, to: number) => void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  error: null,
  agents: {},

  setAgentState: (sessionId, state) =>
    set((current) => ({ agents: { ...current.agents, [sessionId]: state } })),

  openTerminal: async (spawn = {}) => {
    const settings = useSettingsStore.getState().settings;
    try {
      const instance = await TerminalInstance.create(settings, { cwd: spawn.cwd });
      instances.set(instance.session.id, instance);
      openedTerminals += 1;
      set((state) => ({
        tabs: [
          ...state.tabs,
          {
            kind: "terminal",
            id: instance.session.id,
            name: spawn.name ?? t("sidebar.terminalName", { n: openedTerminals }),
            cwd: instance.session.cwd,
            shell: instance.session.shell,
          },
        ],
        activeId: instance.session.id,
        error: null,
      }));
      return instance.session.id;
    } catch (cause) {
      set({ error: String(cause) });
      return null;
    }
  },

  openSettings: (name) => {
    openedSettings += 1;
    const id = `settings-${openedSettings}`;
    set((state) => ({
      tabs: [...state.tabs, { kind: "settings", id, name: name ?? t("settings.title") }],
      activeId: id,
    }));
  },

  /**
   * Reopens what was open last time. Only the shells come back -- whatever was
   * running inside them died with the last process.
   */
  restore: async (saved, activeIndex, onOpen) => {
    const ids: string[] = [];
    for (const [index, tab] of saved.entries()) {
      if (tab.kind === "settings") {
        get().openSettings(tab.name);
        ids.push(get().activeId ?? "");
        continue;
      }
      const id = await get().openTerminal({ cwd: tab.cwd, name: tab.name });
      if (!id) continue;
      // Seeded right away, before anything can render against an empty draft.
      onOpen?.(id, index);
      ids.push(id);
    }
    const active = ids[activeIndex] ?? ids[ids.length - 1] ?? null;
    if (active) set({ activeId: active });
  },

  /** Closes a tab; a terminal takes its whole process tree with it. */
  close: async (id) => {
    const instance = instances.get(id);
    instances.delete(id);

    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === id);
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      const activeId =
        state.activeId === id
          ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
          : state.activeId;
      const { [id]: _closed, ...agents } = state.agents;
      return { tabs, activeId, agents };
    });

    await instance?.dispose();
    // A terminal app with no tabs at all is not useful.
    if (get().tabs.length === 0) await get().openTerminal();
  },

  activate: (id) =>
    set((state) => ({
      activeId: id,
      agents:
        state.agents[id] === "attention"
          ? { ...state.agents, [id]: "waiting" }
          : state.agents,
    })),

  rename: (id, name) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, name: name.trim() || tab.name } : tab,
      ),
    })),

  reorder: (from, to) =>
    set((state) => {
      if (from === to) return state;
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(from, 1);
      if (!moved) return state;
      tabs.splice(to, 0, moved);
      return { tabs };
    }),
}));

/** The terminal the composer and the search talk to, if a terminal is active. */
export function activeTerminal(): TerminalTab | null {
  const { tabs, activeId } = useTabsStore.getState();
  const tab = tabs.find((entry) => entry.id === activeId);
  return tab?.kind === "terminal" ? tab : null;
}
