import type { JSONContent } from "@tiptap/core";

import { EMPTY_DRAFT, type Draft, type History } from "./history";
import { rememberShared } from "./sharedHistory";

/**
 * Per-session composer state.
 *
 * Each terminal keeps its own draft: typing a long prompt for one session and
 * switching to another must not mix the two. The history is shared and lives in
 * `./sharedHistory`, because what has already been run belongs to no one tab.
 *
 * A plain module-level map rather than React state -- nothing renders from it
 * directly, the editor is loaded from it when the active session changes.
 */
export interface ComposerState {
  doc: JSONContent;
}

const states = new Map<string, ComposerState>();

export const EMPTY_COMPOSER_STATE: ComposerState = { doc: EMPTY_DRAFT.doc };

export function loadComposerState(sessionId: string | null): ComposerState {
  if (!sessionId) return EMPTY_COMPOSER_STATE;
  return states.get(sessionId) ?? EMPTY_COMPOSER_STATE;
}

export function saveComposerState(
  sessionId: string | null,
  state: ComposerState,
): void {
  if (sessionId) states.set(sessionId, state);
}

/**
 * Records a command the shell ran, so it can be recalled like anything else.
 *
 * Reached here from the shell itself, which reports every command it runs --
 * including the ones typed straight into the terminal, which the composer would
 * otherwise never see.
 */
export function rememberCommand(text: string): History {
  return rememberShared(draftOf(text));
}

export function draftOf(text: string): Draft {
  return {
    doc: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
    text,
  };
}

/** Drops the state of sessions that no longer exist. */
export function pruneComposerStates(liveSessionIds: string[]): void {
  const live = new Set(liveSessionIds);
  for (const id of states.keys()) {
    if (!live.has(id)) states.delete(id);
  }
}
