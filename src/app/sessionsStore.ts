import { create } from "zustand";

import { TerminalInstance } from "../terminal/TerminalInstance";
import { useSettingsStore } from "./settingsStore";

/** What the UI lists. Matches the session model in the spec. */
export interface TerminalSession {
  id: string;
  name: string;
  cwd: string;
  shell: string;
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

let opened = 0;

interface SessionsState {
  sessions: TerminalSession[];
  activeId: string | null;
  error: string | null;
  open: (spawn?: { cwd?: string; name?: string }) => Promise<string | null>;
  restore: (
    saved: Array<{ name: string; cwd: string }>,
    activeIndex: number,
    onOpen?: (id: string, index: number) => void,
  ) => Promise<string[]>;
  close: (id: string) => Promise<void>;
  activate: (id: string) => void;
  rename: (id: string, name: string) => void;
  reorder: (from: number, to: number) => void;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  activeId: null,
  error: null,

  open: async (spawn = {}) => {
    const settings = useSettingsStore.getState().settings;
    try {
      const instance = await TerminalInstance.create(settings, { cwd: spawn.cwd });
      instances.set(instance.session.id, instance);
      opened += 1;
      set((state) => ({
        sessions: [
          ...state.sessions,
          {
            id: instance.session.id,
            name: spawn.name ?? `Терминал ${opened}`,
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

  /**
   * Reopens the terminals from a previous run. Only the shells come back --
   * whatever was running inside them died with the last process.
   */
  restore: async (saved, activeIndex, onOpen) => {
    const ids: string[] = [];
    for (const [index, session] of saved.entries()) {
      const id = await get().open({ cwd: session.cwd, name: session.name });
      if (!id) continue;
      // Seeded right away, before anything can render against an empty draft.
      onOpen?.(id, index);
      ids.push(id);
    }
    const active = ids[activeIndex] ?? ids[ids.length - 1] ?? null;
    if (active) set({ activeId: active });
    return ids;
  },

  /** Closes a session, taking its whole process tree with it. */
  close: async (id) => {
    const instance = instances.get(id);
    instances.delete(id);

    set((state) => {
      const index = state.sessions.findIndex((session) => session.id === id);
      const sessions = state.sessions.filter((session) => session.id !== id);
      const activeId =
        state.activeId === id
          ? (sessions[Math.min(index, sessions.length - 1)]?.id ?? null)
          : state.activeId;
      return { sessions, activeId };
    });

    await instance?.dispose();
    // A terminal app with no terminal is not useful.
    if (get().sessions.length === 0) await get().open();
  },

  activate: (id) => set({ activeId: id }),

  rename: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, name: name.trim() || session.name } : session,
      ),
    })),

  reorder: (from, to) =>
    set((state) => {
      if (from === to) return state;
      const sessions = [...state.sessions];
      const [moved] = sessions.splice(from, 1);
      if (!moved) return state;
      sessions.splice(to, 0, moved);
      return { sessions };
    }),
}));
