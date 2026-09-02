import type { Message } from "../types";

/**
 * What the program currently attached to the PTY can handle.
 *
 * Capabilities are observed by the terminal layer (xterm.js tracks the modes
 * the running program enables) and handed to the adapter, so adapters stay
 * pure functions of `(message, capabilities)`.
 */
export interface TargetCapabilities {
  /**
   * The target has switched on bracketed paste mode (DECSET 2004). When true,
   * multi-line input can be delivered as a single paste instead of being
   * executed line by line.
   */
  bracketedPaste: boolean;
}

/**
 * One write into the PTY.
 *
 * A submission is a *sequence* of writes rather than one string because timing
 * is part of what a target understands: TUIs decide whether input is a paste or
 * typing by how fast it arrives, so an adapter has to be able to say "send this,
 * let it settle, then send that".
 */
export interface PtyWrite {
  data: string;
  /** Milliseconds to wait before this write. */
  delayBefore?: number;
}

export interface Adapter {
  readonly id: string;
  /** Serializes a message into the writes that deliver it to the target. */
  serialize(message: Message, capabilities: TargetCapabilities): PtyWrite[];
  /**
   * Best-effort "stop what I just sent".
   *
   * Nothing can un-send bytes already written to a PTY, so this is an
   * interrupt, not an undo: how a target is asked to abort is target
   * knowledge, which is why it lives here.
   */
  abort(): PtyWrite[];
  /**
   * A hard interrupt -- the deliberate one the user asks for with Ctrl+C,
   * as opposed to the gentle `abort()` behind an accidental Esc.
   */
  interrupt(): PtyWrite[];
}
