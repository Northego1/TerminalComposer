import type { Block, Message } from "../types";
import type { Adapter, TargetCapabilities } from "./Adapter";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const SUBMIT = "\r";

/**
 * Default adapter: writes the message into a PTY the way a terminal writes a
 * paste. Attachments become shell-quoted absolute paths at the position they
 * occupied in the composer.
 *
 * Works for a plain shell and, unchanged, for any CLI agent reading stdin --
 * which is the point of the adapter layer. Nothing here is agent-specific.
 */
export const shellAdapter: Adapter = {
  id: "shell",

  serialize(message: Message, capabilities: TargetCapabilities): string {
    const body = renderBlocks(message.blocks);
    if (!body) return "";

    // Terminals transmit newlines inside a paste as CR, and so does xterm.js.
    const payload = body.replace(/\r?\n/g, "\r");

    // Without bracketed paste the target cannot tell a paste from typing, so a
    // multi-line message is executed line by line. That is the target's own
    // contract -- we do not fake it with escape sequences it never asked for.
    return capabilities.bracketedPaste
      ? PASTE_START + payload + PASTE_END + SUBMIT
      : payload + SUBMIT;
  },
};

function renderBlocks(blocks: Block[]): string {
  let out = "";
  for (const block of blocks) {
    const piece = block.type === "text" ? block.text : shellQuote(block.path);
    if (!piece) continue;
    if (out && !/\s$/.test(out) && !/^\s/.test(piece)) out += " ";
    out += piece;
  }
  return out.trim();
}

/** POSIX-safe quoting, so paths with spaces or quotes survive the shell. */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
