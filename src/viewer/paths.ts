/**
 * Finding words in a line of terminal output that might name a file.
 *
 * Might is the operative word: this only narrows the line down to candidates,
 * and whether each one exists is answered by the filesystem. Deciding from the
 * text alone would underline every word with a dot in it.
 */

export interface Candidate {
  text: string;
  /** Column range within the line, zero-based and end-exclusive. */
  start: number;
  end: number;
}

/**
 * A path, or something shaped enough like one to be worth asking about: any
 * word containing a slash, or a bare name with a short extension.
 */
const CANDIDATE = /(?:~|\.{1,2})?[\w.@+-]*\/[\w.@+/-]+|[\w.@+-]+\.[a-zA-Z0-9]{1,8}/g;

/** Trailing `:12` or `:12:5` from compiler and linter output. */
const LINE_COLUMN = /:\d+(?::\d+)?$/;

export function findCandidates(line: string): Candidate[] {
  const found: Candidate[] = [];
  for (const match of line.matchAll(CANDIDATE)) {
    if (match.index === undefined) continue;
    // Punctuation that ends a sentence is not part of the name.
    const trimmed = match[0].replace(/[.,;:'")\]]+$/, "");
    const text = trimmed.replace(LINE_COLUMN, "");
    if (!text || text === "." || text === "..") continue;
    found.push({ text, start: match.index, end: match.index + text.length });
  }
  return found;
}
