import { create } from "zustand";

import type { AgentState } from "../agent/events";
import { t } from "../i18n";
import { context } from "../terminal/ptyClient";
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
  /**
   * The user named this one, so nothing else may.
   *
   * Without it a name typed by hand would be overwritten by the next `cd`.
   */
  renamed?: boolean;
}

export interface SettingsTab {
  kind: "settings";
  id: string;
  name: string;
}

export type Tab = TerminalTab | SettingsTab;

/**
 * Files opened from one terminal.
 *
 * They share the row of tabs above the terminal, and `active` says which of
 * them is on screen -- `null` means the terminal itself is.
 */
export interface ViewerFiles {
  paths: string[];
  active: string | null;
}

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

let openedSettings = 0;

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  error: string | null;
  /** The files each terminal tab has open beside it, and which is shown. */
  viewers: Record<string, ViewerFiles>;
  openFile: (path: string) => void;
  showFile: (tabId: string, path: string | null) => void;
  closeFile: (tabId: string, path: string) => void;
  /** What the agent in each terminal is doing, when one reports it. */
  agents: Record<string, AgentState>;
  setAgentState: (sessionId: string, state: AgentState) => void;
  openTerminal: (spawn?: {
    cwd?: string;
    name?: string;
    renamed?: boolean;
  }) => Promise<string | null>;
  openSettings: (name?: string) => void;
  restore: (
    saved: Array<{
      kind: Tab["kind"];
      name: string;
      renamed?: boolean;
      cwd?: string;
    }>,
    activeIndex: number,
    onOpen?: (id: string, index: number) => void,
  ) => Promise<void>;
  close: (id: string) => Promise<void>;
  activate: (id: string) => void;
  rename: (id: string, name: string) => void;
  setTabContext: (id: string, cwd: string) => void;
  reorder: (from: number, to: number) => void;
}

/**
 * What to call a terminal that has not been named by hand.
 *
 * A number, and the same number for as long as the tab lives. The directory it
 * sits in and the program it runs both change while the tab does not, and a
 * name that moved with them would be a different name every minute -- the rail
 * is read to find a terminal again, which needs the name to hold still.
 *
 * The lowest number nobody is using, so closing the second of three does not
 * push the next one to four.
 */
function terminalName(tabs: Tab[]): string {
  const taken = new Set(tabs.map((tab) => tab.name));
  for (let n = 1; n <= taken.size + 1; n += 1) {
    const candidate = t("sidebar.terminalName", { n });
    if (!taken.has(candidate)) return candidate;
  }
  return t("sidebar.terminalName", { n: taken.size + 1 });
}

/**
 * Keeps a tab's directory current from what the session reports.
 *
 * Only the directory: the name in the rail is the tab's own and holds still
 * until it is renamed by hand. The header shows where the shell actually is,
 * and only the shell knows that -- it is read from its `/proc` entry whenever
 * it comes back to a prompt, since a command may have left it somewhere else.
 */
function watchForContext(instance: TerminalInstance): void {
  const { id } = instance.session;

  instance.onShellStateChange((state) => {
    if (state !== "prompt") return;
    void context(id)
      .then(({ cwd }) => useTabsStore.getState().setTabContext(id, cwd))
      .catch(() => {
        // The session is on its way out; its tab is going with it.
      });
  });
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  error: null,
  viewers: {},

  /** Opens a file in a tab above the terminal that named it, and shows it. */
  openFile: (path) =>
    set((state) => {
      const tabId = state.activeId;
      if (!tabId) return state;
      const open = state.viewers[tabId]?.paths ?? [];
      const paths = open.includes(path) ? open : [...open, path];
      return { viewers: { ...state.viewers, [tabId]: { paths, active: path } } };
    }),

  showFile: (tabId, path) =>
    set((state) => {
      const open = state.viewers[tabId];
      if (!open) return state;
      return { viewers: { ...state.viewers, [tabId]: { ...open, active: path } } };
    }),

  closeFile: (tabId, path) =>
    set((state) => {
      const open = state.viewers[tabId];
      if (!open) return state;
      const paths = open.paths.filter((each) => each !== path);
      if (!paths.length) {
        const { [tabId]: _empty, ...viewers } = state.viewers;
        return { viewers };
      }
      // Closing what you were looking at falls back to the neighbour, and to
      // the terminal when that was the last file.
      const index = open.paths.indexOf(path);
      const active =
        open.active === path
          ? (paths[Math.min(index, paths.length - 1)] ?? null)
          : open.active;
      return { viewers: { ...state.viewers, [tabId]: { paths, active } } };
    }),
  agents: {},

  setAgentState: (sessionId, state) =>
    set((current) => ({ agents: { ...current.agents, [sessionId]: state } })),

  openTerminal: async (spawn = {}) => {
    const settings = useSettingsStore.getState().settings;
    try {
      const instance = await TerminalInstance.create(settings, { cwd: spawn.cwd });
      instances.set(instance.session.id, instance);
      watchForContext(instance);
      set((state) => ({
        tabs: [
          ...state.tabs,
          {
            kind: "terminal",
            id: instance.session.id,
            name: spawn.name ?? terminalName(state.tabs),
            renamed: spawn.renamed,
            cwd: instance.session.cwd,
            shell: instance.session.shell,
          },
        ],
        activeId: instance.session.id,
        error: null,
  viewers: {},

  /** Opens a file in a tab above the terminal that named it, and shows it. */
  openFile: (path) =>
    set((state) => {
      const tabId = state.activeId;
      if (!tabId) return state;
      const open = state.viewers[tabId]?.paths ?? [];
      const paths = open.includes(path) ? open : [...open, path];
      return { viewers: { ...state.viewers, [tabId]: { paths, active: path } } };
    }),

  showFile: (tabId, path) =>
    set((state) => {
      const open = state.viewers[tabId];
      if (!open) return state;
      return { viewers: { ...state.viewers, [tabId]: { ...open, active: path } } };
    }),

  closeFile: (tabId, path) =>
    set((state) => {
      const open = state.viewers[tabId];
      if (!open) return state;
      const paths = open.paths.filter((each) => each !== path);
      if (!paths.length) {
        const { [tabId]: _empty, ...viewers } = state.viewers;
        return { viewers };
      }
      // Closing what you were looking at falls back to the neighbour, and to
      // the terminal when that was the last file.
      const index = open.paths.indexOf(path);
      const active =
        open.active === path
          ? (paths[Math.min(index, paths.length - 1)] ?? null)
          : open.active;
      return { viewers: { ...state.viewers, [tabId]: { paths, active } } };
    }),
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
      // A name given by hand comes back; a number is handed out again, so a
      // session restored without its first tab does not start at two.
      const id = await get().openTerminal({
        cwd: tab.cwd,
        name: tab.renamed ? tab.name : undefined,
        renamed: tab.renamed,
      });
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
      const { [id]: _gone, ...viewers } = state.viewers;
      const { [id]: _closed, ...agents } = state.agents;
      return { tabs, activeId, viewers, agents };
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
        tab.id === id
          ? { ...tab, name: name.trim() || tab.name, renamed: true }
          : tab,
      ),
    })),

  /**
   * Where the shell is now.
   *
   * The directory a terminal was started in is not the one it is in a minute
   * later, and both the tab's name and the header's path are about the second.
   */
  setTabContext: (id, cwd) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id && tab.kind === "terminal"
          ? {
              ...tab,
              // Only the directory: the header shows it, and the name in the
              // rail stays what it was.
              cwd,
            }
          : tab,
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
