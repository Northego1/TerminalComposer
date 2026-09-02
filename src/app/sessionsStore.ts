import { create } from "zustand";

import { TerminalInstance } from "../terminal/TerminalInstance";

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

let opened = 0;

interface SessionsState {
  sessions: TerminalSession[];
  activeId: string | null;
  error: string | null;
  open: () => Promise<void>;
  close: (id: string) => Promise<void>;
  activate: (id: string) => void;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  activeId: null,
  error: null,

  open: async () => {
    try {
      const instance = await TerminalInstance.create();
      instances.set(instance.session.id, instance);
      opened += 1;
      set((state) => ({
        sessions: [
          ...state.sessions,
          {
            id: instance.session.id,
            name: `Терминал ${opened}`,
            cwd: instance.session.cwd,
            shell: instance.session.shell,
          },
        ],
        activeId: instance.session.id,
        error: null,
      }));
    } catch (cause) {
      set({ error: String(cause) });
    }
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
}));
