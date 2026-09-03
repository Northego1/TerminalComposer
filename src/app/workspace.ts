/**
 * What was open last time: the tabs, their order and names, and what was typed
 * into each composer.
 *
 * Saves are debounced because they are triggered by typing. The snapshot is
 * taken from the live stores, so there is no second copy of this state to keep
 * in sync.
 */
import { loadComposerState, type ComposerState } from "../composer/state/drafts";
import { sharedHistory } from "../composer/state/sharedHistory";
import type { History } from "../composer/state/history";
import { readDocument, writeDocument } from "./persistence";
import { useTabsStore, type Tab } from "./tabsStore";

const SAVE_DEBOUNCE_MS = 700;

export interface PersistedTab {
  kind: Tab["kind"];
  name: string;
  /** Whether the name was given by hand; an automatic one is derived again. */
  renamed?: boolean;
  cwd?: string;
  composer?: ComposerState;
}

export interface Workspace {
  tabs: PersistedTab[];
  activeIndex: number;
  /** One list for every terminal, the way a shell has one history file. */
  history?: History;
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
  const { tabs, activeId } = useTabsStore.getState();
  return {
    tabs: tabs.map((tab) =>
      tab.kind === "terminal"
        ? {
            kind: tab.kind,
            name: tab.name,
            renamed: tab.renamed,
            cwd: tab.cwd,
            composer: loadComposerState(tab.id),
          }
        : { kind: tab.kind, name: tab.name },
    ),
    activeIndex: Math.max(
      0,
      tabs.findIndex((tab) => tab.id === activeId),
    ),
    history: sharedHistory(),
  };
}
