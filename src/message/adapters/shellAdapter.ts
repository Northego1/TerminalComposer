import type { Block, Message } from "../types";
import type { Adapter, PtyWrite, TargetCapabilities } from "./Adapter";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const SUBMIT = "\r";

/**
 * How long to wait after a paste before sending the submitting CR.
 *
 * TUIs built on Ink (Claude Code among them) treat input arriving immediately
 * after a paste as part of that paste, so a CR sent in the same burst lands in
 * their input box as a newline instead of submitting. Waiting until the paste
 * has settled makes the CR a keystroke again.
 */
const PASTE_SETTLE_MS = 120;

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

  serialize(message: Message, capabilities: TargetCapabilities): PtyWrite[] {
    const body = renderBlocks(message.blocks);
    if (!body) return [];

    // Terminals transmit newlines inside a paste as CR, and so does xterm.js.
    const payload = body.replace(/\r?\n/g, "\r");

    // Without bracketed paste the target cannot tell a paste from typing, so a
    // multi-line message is executed line by line. That is the target's own
    // contract -- we do not fake it with escape sequences it never asked for.
    if (!capabilities.bracketedPaste) {
      return [{ data: payload + SUBMIT }];
    }

    return [
      { data: PASTE_START + payload + PASTE_END },
      { data: SUBMIT, delayBefore: PASTE_SETTLE_MS },
    ];
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
