/**
 * What was open last time: the terminals, their order and names, and what was
 * typed into each composer.
 *
 * Saves are debounced because they are triggered by typing. The snapshot is
 * taken from the live stores, so there is no second copy of this state to keep
 * in sync.
 */
import { loadComposerState, type ComposerState } from "../composer/state/drafts";
import { readDocument, writeDocument } from "./persistence";
import { useSessionsStore } from "./sessionsStore";

const SAVE_DEBOUNCE_MS = 700;

export interface PersistedSession {
  name: string;
  cwd: string;
  composer: ComposerState;
}

export interface Workspace {
  sessions: PersistedSession[];
  activeIndex: number;
}

export function readWorkspace(): Promise<Workspace | null> {
  return readDocument<Workspace>("workspace");
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function scheduleWorkspaceSave(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void writeDocument("workspace", snapshot()), SAVE_DEBOUNCE_MS);
}

function snapshot(): Workspace {
  const { sessions, activeId } = useSessionsStore.getState();
  return {
    sessions: sessions.map((session) => ({
      name: session.name,
      cwd: session.cwd,
      composer: loadComposerState(session.id),
    })),
    activeIndex: Math.max(
      0,
      sessions.findIndex((session) => session.id === activeId),
    ),
  };
}
