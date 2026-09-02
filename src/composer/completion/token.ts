import type { EditorState } from "@tiptap/pm/state";

/**
 * The word the caret is sitting in, and where it starts.
 *
 * Completion replaces exactly this much of the text, so both ends matter: the
 * caret position is where it ends, and the last whitespace before it is where
 * it begins.
 */
export interface Token {
  text: string;
  /** Document position of the token's first character. */
  from: number;
  to: number;
  /** Nothing but whitespace precedes it on its line. */
  first: boolean;
  /** The whole line up to the caret -- what command this is, and its words. */
  line: string;
}

/** Path-shaped enough to offer completions without being asked. */
const LOOKS_LIKE_PATH = /[/~]/;

export function tokenAtCaret(state: EditorState): Token | null {
  const { from, empty } = state.selection;
  if (!empty) return null;

  const before = state.doc.textBetween(0, from, "\n", "\n");
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const match = /\S+$/.exec(line);
  if (!match) return null;

  return {
    text: match[0],
    from: from - match[0].length,
    to: from,
    // The first word of a line is a command; everything after it is an
    // argument, and arguments are paths far more often than not.
    first: line.slice(0, match.index).trim() === "",
    line,
  };
}

/** Whether this token should bring up completions on its own. */
export function invitesCompletion(token: Token): boolean {
  return LOOKS_LIKE_PATH.test(token.text);
}
