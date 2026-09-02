import type { JSONContent } from "@tiptap/core";

import { EMPTY_DRAFT, EMPTY_HISTORY, type History } from "./history";

/**
 * Per-session composer state.
 *
 * Each terminal gets its own draft and its own recall history: typing a long
 * prompt for one session and switching to another must not mix the two. This
 * is a plain module-level map rather than React state -- nothing renders from
 * it directly, the editor is loaded from it when the active session changes.
 */
export interface ComposerState {
  doc: JSONContent;
  history: History;
}

const states = new Map<string, ComposerState>();

export const EMPTY_COMPOSER_STATE: ComposerState = {
  doc: EMPTY_DRAFT.doc,
  history: EMPTY_HISTORY,
};

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

/** Drops the state of sessions that no longer exist. */
export function pruneComposerStates(liveSessionIds: string[]): void {
  const live = new Set(liveSessionIds);
  for (const id of states.keys()) {
    if (!live.has(id)) states.delete(id);
  }
}
