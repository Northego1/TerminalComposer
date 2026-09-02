/**
 * Splitting a command line into the pieces worth colouring.
 *
 * Not a shell parser and not trying to be one: quoting, the first word, flags
 * and everything else. That is as far as colour needs to go, and further would
 * be a second implementation of zsh with all the ways that can be wrong.
 */

export type TokenKind = "command" | "flag" | "string" | "word";

export interface LineToken {
  text: string;
  kind: TokenKind;
  /** Offsets within the line, end-exclusive. */
  start: number;
  end: number;
}

const SEPARATORS = new Set(["|", "||", "&&", ";", "&"]);

export function tokenizeLine(line: string): LineToken[] {
  const tokens: LineToken[] = [];
  let index = 0;
  let expectCommand = true;

  while (index < line.length) {
    if (/\s/.test(line[index])) {
      index += 1;
      continue;
    }

    const start = index;
    const opening = line[index];

    if (opening === '"' || opening === "'") {
      index += 1;
      while (index < line.length && line[index] !== opening) index += 1;
      if (index < line.length) index += 1;
      tokens.push({ text: line.slice(start, index), kind: "string", start, end: index });
      expectCommand = false;
      continue;
    }

    while (index < line.length && !/\s/.test(line[index])) index += 1;
    const text = line.slice(start, index);

    // A separator ends one command and starts the next.
    if (SEPARATORS.has(text)) {
      expectCommand = true;
      continue;
    }

    const kind: TokenKind = expectCommand
      ? "command"
      : text.startsWith("-")
        ? "flag"
        : "word";
    tokens.push({ text, kind, start, end: index });
    if (kind === "command") expectCommand = false;
  }

  return tokens;
}
