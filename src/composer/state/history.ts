import type { JSONContent } from "@tiptap/core";

/**
 * Recall of what has already been submitted, the way a shell or a chat input
 * does it: Up walks back, Down walks forward, and the draft you were typing
 * comes back when you walk past the newest entry.
 *
 * Entries carry the whole editor document, not its text, so recalling a message
 * brings its attachments back with it.
 *
 * This is the composer's own list of submitted messages -- not the shell's
 * history. Nothing here knows about the terminal, and it is pure so the
 * behaviour can be tested without a DOM.
 */

export interface Draft {
  /** The editor document, attachments and all. */
  doc: JSONContent;
  /** Plain text of that document, used to compare entries. */
  text: string;
}

export interface History {
  /** Submitted drafts, oldest first. */
  entries: Draft[];
  /** Position while recalling; `entries.length` means "editing the draft". */
  cursor: number;
  /** What was being typed before recall started. */
  draft: Draft;
}

export interface Recall {
  history: History;
  draft: Draft;
}

export const EMPTY_DRAFT: Draft = {
  doc: { type: "doc", content: [{ type: "paragraph" }] },
  text: "",
};

export const EMPTY_HISTORY: History = {
  entries: [],
  cursor: 0,
  draft: EMPTY_DRAFT,
};

/**
 * Records a submission and returns to a fresh draft.
 *
 * Callers only submit non-empty messages, so there is no emptiness check here --
 * only a guard against filling the history with repeats.
 */
export function remember(history: History, draft: Draft): History {
  const previousEntry = history.entries[history.entries.length - 1];
  const entries = isSameDraft(previousEntry, draft)
    ? history.entries
    : [...history.entries, draft];

  return { entries, cursor: entries.length, draft: EMPTY_DRAFT };
}

/** Walks one entry back. Returns null when there is nothing older. */
export function previous(history: History, current: Draft): Recall | null {
  if (history.cursor === 0) return null;

  const atDraft = history.cursor === history.entries.length;
  const cursor = history.cursor - 1;
  return {
    history: {
      ...history,
      cursor,
      draft: atDraft ? current : history.draft,
    },
    draft: history.entries[cursor],
  };
}

/** Walks one entry forward, ending on the draft. Null when already there. */
export function next(history: History): Recall | null {
  if (history.cursor >= history.entries.length) return null;

  const cursor = history.cursor + 1;
  return {
    history: { ...history, cursor },
    draft:
      cursor === history.entries.length ? history.draft : history.entries[cursor],
  };
}

function isSameDraft(a: Draft | undefined, b: Draft): boolean {
  return a !== undefined && JSON.stringify(a.doc) === JSON.stringify(b.doc);
}
