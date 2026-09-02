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

export interface Adapter {
  readonly id: string;
  /** Serializes a message into the exact string to write into the PTY. */
  serialize(message: Message, capabilities: TargetCapabilities): string;
}
