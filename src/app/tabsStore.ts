import { create } from "zustand";

import type { AgentState } from "../agent/events";
import { t } from "../i18n";
import { context } from "../terminal/ptyClient";
import { TerminalInstance } from "../terminal/TerminalInstance";
import {
  flatLayout,
  fromPersisted,
  paneNode,
  movePane,
  panesOf,
  removePane,
  resize,
  splitPane,
  type Side,
  type Layout,
  type PersistedLayout,
  type SplitDirection,
} from "./layout";
import { useSettingsStore } from "./settingsStore";

/**
 * One shell inside a terminal tab.
 *
 * Its id is the PTY session's id: everything that talks to a running shell --
 * the composer, the search, the agent events -- addresses it by that.
 */
export interface TerminalPane {
  id: string;
  cwd: string;
  shell: string;
}

export type { SplitDirection } from "./layout";

/**
 * The left rail lists tabs, and a tab is either a terminal or a settings page.
 * Settings being a tab rather than a dialog means it opens as many times as the
 * user wants and closes exactly like everything else.
 *
 * A terminal tab holds one shell or several side by side. The tab is what the
 * rail names, drags and closes; the panes are what the keyboard reaches, one
 * at a time.
 */
export interface TerminalTab {
  kind: "terminal";
  id: string;
  name: string;
  /**
   * The user named this one, so nothing else may.
   *
   * Without it a name typed by hand would be overwritten by the next `cd`.
   */
  renamed?: boolean;
  /** In split order. Never empty: a tab with no shells closes itself. */
  panes: TerminalPane[];
  /**
   * Where those shells sit relative to each other: a tree of splits, so a
   * split divides the shell it was asked to divide and nothing else. Every
   * shell in `panes` is a leaf of it, and every leaf is one of them.
   */
  layout: Layout;
  /** The pane that has the keyboard whenever this tab is the one on screen. */
  paneId: string;
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
  /** What the agent in each terminal tab is doing, when one reports it. */
  agents: Record<string, AgentState>;
  setAgentState: (sessionId: string, state: AgentState) => void;
  openTerminal: (spawn?: {
    cwd?: string;
    name?: string;
    renamed?: boolean;
  }) => Promise<string | null>;
  /**
   * Splits the focused shell in two, in the direction asked for: the new one
   * opens in the directory the focused one is in, takes half of its space and
   * gets the keyboard. Only that shell is divided -- its neighbours stay
   * exactly where they are.
   */
  split: (direction?: SplitDirection) => Promise<string | null>;
  /**
   * Moves the boundary between two neighbouring shells, as dragging the
   * splitter between them does.
   */
  resizeSplit: (
    tabId: string,
    splitId: string,
    index: number,
    before: number,
    after: number,
  ) => void;
  /** Closes one shell; closing the last one in a tab closes the tab. */
  closePane: (sessionId: string) => Promise<void>;
  /** Gives one shell the keyboard, showing its tab if it is not the one shown. */
  focusPane: (sessionId: string) => void;
  /** Moves the keyboard to the neighbouring shell in the active tab. */
  stepPane: (direction: 1 | -1) => void;
  /**
   * Moves a shell to the side of another one, as dragging it there does. Both
   * are in the same tab; the shell keeps everything it is running.
   */
  movePane: (paneId: string, besideId: string, side: Side) => void;
  openSettings: (name?: string) => void;
  restore: (
    saved: Array<{
      kind: Tab["kind"];
      name: string;
      renamed?: boolean;
      cwd?: string;
      panes?: Array<{ cwd?: string; size?: number }>;
      direction?: SplitDirection;
      layout?: PersistedLayout;
    }>,
    activeIndex: number,
    onOpen?: (id: string, index: number) => void,
  ) => Promise<void>;
  close: (id: string) => Promise<void>;
  activate: (id: string) => void;
  rename: (id: string, name: string) => void;
  setPaneContext: (sessionId: string, cwd: string) => void;
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
 * Keeps a pane's directory current from what the session reports.
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
      .then(({ cwd }) => useTabsStore.getState().setPaneContext(id, cwd))
      .catch(() => {
        // The session is on its way out; its tab is going with it.
      });
  });
}

/** Starts a shell and registers it; the caller decides which tab it joins. */
async function spawnPane(cwd?: string): Promise<TerminalPane> {
  const settings = useSettingsStore.getState().settings;
  const instance = await TerminalInstance.create(settings, { cwd });
  instances.set(instance.session.id, instance);
  watchForContext(instance);
  return {
    id: instance.session.id,
    cwd: instance.session.cwd,
    shell: instance.session.shell,
  };
}

/**
 * A fresh id for a split in the layout tree.
 *
 * Splits are not sessions and have nothing to be named after, but a drag has
 * to say which boundary of which split it is moving.
 */
function splitId(): string {
  return crypto.randomUUID();
}

/** The tab a shell belongs to, if any. */
function tabOfPane(tabs: Tab[], sessionId: string): TerminalTab | undefined {
  return tabs.find(
    (tab): tab is TerminalTab =>
      tab.kind === "terminal" && tab.panes.some((pane) => pane.id === sessionId),
  );
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

  // The rail marks tabs, so what a shell reports is filed under its tab.
  setAgentState: (sessionId, state) =>
    set((current) => {
      const tab = tabOfPane(current.tabs, sessionId);
      if (!tab) return current;
      return { agents: { ...current.agents, [tab.id]: state } };
    }),

  openTerminal: async (spawn = {}) => {
    try {
      const pane = await spawnPane(spawn.cwd);
      set((state) => ({
        tabs: [
          ...state.tabs,
          {
            kind: "terminal",
            id: pane.id,
            name: spawn.name ?? terminalName(state.tabs),
            renamed: spawn.renamed,
            panes: [pane],
            paneId: pane.id,
            layout: paneNode(pane.id),
          },
        ],
        activeId: pane.id,
        error: null,
      }));
      return pane.id;
    } catch (cause) {
      set({ error: String(cause) });
      return null;
    }
  },

  split: async (direction = "row") => {
    const tab = activeTerminal();
    if (!tab) return null;
    const beside = tab.panes.find((pane) => pane.id === tab.paneId);
    try {
      const opened = await spawnPane(beside?.cwd);
      set((state) => ({
        tabs: state.tabs.map((each) => {
          if (each.id !== tab.id || each.kind !== "terminal") return each;
          // Beside the shell it was split from in the rail as well as on
          // screen, so both read in the same order.
          const index = each.panes.findIndex((pane) => pane.id === beside?.id);
          const panes = [...each.panes];
          panes.splice(index + 1, 0, opened);
          return {
            ...each,
            panes,
            paneId: opened.id,
            layout: splitPane(
              each.layout,
              beside?.id ?? each.paneId,
              direction,
              opened.id,
              splitId,
            ),
          };
        }),
        error: null,
      }));
      return opened.id;
    } catch (cause) {
      set({ error: String(cause) });
      return null;
    }
  },

  closePane: async (sessionId) => {
    const tab = tabOfPane(get().tabs, sessionId);
    if (!tab) return;
    if (tab.panes.length === 1) return get().close(tab.id);

    const instance = instances.get(sessionId);
    instances.delete(sessionId);
    set((state) => ({
      tabs: state.tabs.map((each) => {
        if (each.id !== tab.id || each.kind !== "terminal") return each;
        const index = each.panes.findIndex((pane) => pane.id === sessionId);
        const panes = each.panes.filter((pane) => pane.id !== sessionId);
        // The keyboard moves to the neighbour, the way closing a tab works.
        const paneId =
          each.paneId === sessionId
            ? panes[Math.min(index, panes.length - 1)].id
            : each.paneId;
        // The tab holds at least one shell here, so the tree does too.
        const layout = removePane(each.layout, sessionId) ?? each.layout;
        return { ...each, panes, paneId, layout };
      }),
    }));
    await instance?.dispose();
  },

  resizeSplit: (tabId, splitId, index, before, after) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId && tab.kind === "terminal"
          ? { ...tab, layout: resize(tab.layout, splitId, index, before, after) }
          : tab,
      ),
    })),

  focusPane: (sessionId) =>
    set((state) => {
      const tab = tabOfPane(state.tabs, sessionId);
      if (!tab) return state;
      return {
        activeId: tab.id,
        tabs: state.tabs.map((each) =>
          each.id === tab.id ? { ...each, paneId: sessionId } : each,
        ),
      };
    }),

  movePane: (paneId, besideId, side) =>
    set((state) => {
      const tab = tabOfPane(state.tabs, paneId);
      if (!tab || paneId === besideId) return state;
      if (!tab.panes.some((pane) => pane.id === besideId)) return state;

      const layout = movePane(tab.layout, paneId, besideId, side, splitId);
      // The rail lists the shells in the order they are drawn, so it follows
      // the layout rather than the order they were opened in.
      const order = panesOf(layout);
      const panes = [...tab.panes].sort(
        (one, other) => order.indexOf(one.id) - order.indexOf(other.id),
      );
      return {
        tabs: state.tabs.map((each) =>
          each.id === tab.id ? { ...each, layout, panes } : each,
        ),
      };
    }),

  stepPane: (direction) => {
    const tab = activeTerminal();
    if (!tab || tab.panes.length < 2) return;
    const index = tab.panes.findIndex((pane) => pane.id === tab.paneId);
    const next = (index + direction + tab.panes.length) % tab.panes.length;
    get().focusPane(tab.panes[next].id);
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
      const [first, ...rest] = tab.panes?.length ? tab.panes : [{ cwd: tab.cwd }];
      const id = await get().openTerminal({
        cwd: first.cwd,
        name: tab.renamed ? tab.name : undefined,
        renamed: tab.renamed,
      });
      if (!id) continue;
      // Seeded right away, before anything can render against an empty draft.
      onOpen?.(id, index);
      ids.push(id);
      // The other shells of a split tab, each where it was. A shell that fails
      // to spawn leaves a gap the layout closes over: one shell short is
      // better than no tab at all.
      const opened: Array<string | undefined> = [id];
      for (const pane of rest) {
        try {
          const added = await spawnPane(pane.cwd);
          opened.push(added.id);
          set((state) => ({
            tabs: state.tabs.map((each) =>
              each.id === id && each.kind === "terminal"
                ? { ...each, panes: [...each.panes, added] }
                : each,
            ),
          }));
        } catch {
          opened.push(undefined);
        }
      }
      // How they were arranged. Files written before there were trees say only
      // which way the whole tab was split, which is one split holding them all.
      const live = opened.filter((each): each is string => Boolean(each));
      const layout =
        (tab.layout && fromPersisted(tab.layout, opened, splitId)) ??
        flatLayout(
          live,
          tab.direction ?? "row",
          (tab.panes ?? []).map((pane) => pane.size),
          splitId,
        );
      set((state) => ({
        tabs: state.tabs.map((each) =>
          each.id === id && each.kind === "terminal"
            ? { ...each, layout }
            : each,
        ),
      }));
    }
    const active = ids[activeIndex] ?? ids[ids.length - 1] ?? null;
    if (active) set({ activeId: active });
  },

  /** Closes a tab; a terminal takes its whole process tree with it. */
  close: async (id) => {
    const tab = get().tabs.find((each) => each.id === id);
    const gone =
      tab?.kind === "terminal"
        ? tab.panes.flatMap((pane) => {
            const instance = instances.get(pane.id);
            instances.delete(pane.id);
            return instance ? [instance] : [];
          })
        : [];
    set((state) => {
      const index = state.tabs.findIndex((each) => each.id === id);
      const tabs = state.tabs.filter((each) => each.id !== id);
      const activeId =
        state.activeId === id
          ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
          : state.activeId;
      const { [id]: _gone, ...viewers } = state.viewers;
      const { [id]: _closed, ...agents } = state.agents;
      return { tabs, activeId, viewers, agents };
    });

    await Promise.all(gone.map((instance) => instance.dispose()));
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
   * later, and the header's path is about the second.
   */
  setPaneContext: (sessionId, cwd) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.kind === "terminal" && tab.panes.some((pane) => pane.id === sessionId)
          ? {
              ...tab,
              panes: tab.panes.map((pane) =>
                pane.id === sessionId ? { ...pane, cwd } : pane,
              ),
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

/** The terminal tab on screen, if a terminal tab is on screen. */
export function activeTerminal(): TerminalTab | null {
  return selectActiveTerminal(useTabsStore.getState());
}

export function selectActiveTerminal(state: {
  tabs: Tab[];
  activeId: string | null;
}): TerminalTab | null {
  const tab = state.tabs.find((entry) => entry.id === state.activeId);
  return tab?.kind === "terminal" ? tab : null;
}

/** The shell the keyboard reaches: the focused pane of the tab on screen. */
export function selectActivePane(state: {
  tabs: Tab[];
  activeId: string | null;
}): TerminalPane | null {
  const tab = selectActiveTerminal(state);
  return tab?.panes.find((pane) => pane.id === tab.paneId) ?? null;
}

/**
 * Its id, as a selector: a string compares by value, so components that only
 * need to know which shell they talk to do not re-render for a `cd` in it.
 */
export function selectActiveSession(state: {
  tabs: Tab[];
  activeId: string | null;
}): string | null {
  return selectActiveTerminal(state)?.paneId ?? null;
}

export function activeSession(): string | null {
  return selectActiveSession(useTabsStore.getState());
}

/** The live terminal behind the focused pane, if there is one. */
export function activeInstance(): TerminalInstance | null {
  return getInstance(activeSession());
}
