/**
 * Recall of what has already been submitted, the way a shell or a chat input
 * does it: Up walks back, Down walks forward, and the draft you were typing
 * comes back when you walk past the newest entry.
 *
 * This is the composer's own list of submitted messages -- not the shell's
 * history. Nothing here knows about the terminal, and it is pure so the
 * behaviour can be tested without a DOM.
 */

export interface History {
  /** Submitted texts, oldest first. */
  entries: string[];
  /** Position while recalling; `entries.length` means "editing the draft". */
  cursor: number;
  /** What was being typed before recall started. */
  draft: string;
}

export interface Recall {
  history: History;
  text: string;
}

export const EMPTY_HISTORY: History = { entries: [], cursor: 0, draft: "" };

/** Records a submission and returns to the (now empty) draft. */
export function remember(history: History, text: string): History {
  const trimmed = text.trim();
  if (!trimmed) return history;

  // Re-submitting the same thing should not fill the history with duplicates.
  const entries =
    history.entries[history.entries.length - 1] === text
      ? history.entries
      : [...history.entries, text];

  return { entries, cursor: entries.length, draft: "" };
}

/** Walks one entry back. Returns null when there is nothing older. */
export function previous(history: History, current: string): Recall | null {
  if (history.cursor === 0) return null;

  const atDraft = history.cursor === history.entries.length;
  const cursor = history.cursor - 1;
  return {
    history: {
      ...history,
      cursor,
      draft: atDraft ? current : history.draft,
    },
    text: history.entries[cursor],
  };
}

/** Walks one entry forward, ending on the draft. Null when already there. */
export function next(history: History): Recall | null {
  if (history.cursor >= history.entries.length) return null;

  const cursor = history.cursor + 1;
  return {
    history: { ...history, cursor },
    text: cursor === history.entries.length ? history.draft : history.entries[cursor],
  };
}
