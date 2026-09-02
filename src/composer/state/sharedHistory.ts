import { remember, type Draft, type History, EMPTY_HISTORY } from "./history";

/**
 * One history for every terminal, the way a shell has one history file.
 *
 * The draft belongs to its tab -- a half-written thought is about that terminal
 * -- but what has actually been run or sent is not: reaching for something you
 * typed in another tab and not finding it is the wrong kind of surprise.
 */
let shared: History = EMPTY_HISTORY;

/** Old entries are dropped rather than kept forever. */
const LIMIT = 500;

export function sharedHistory(): History {
  return shared;
}

export function setSharedHistory(history: History): void {
  shared = trim(history);
}

export function rememberShared(draft: Draft): History {
  shared = trim(remember(shared, draft));
  return shared;
}

function trim(history: History): History {
  if (history.entries.length <= LIMIT) return history;
  const entries = history.entries.slice(-LIMIT);
  return { ...history, entries, cursor: Math.min(history.cursor, entries.length) };
}
