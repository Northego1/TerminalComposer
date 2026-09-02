import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import type { TargetCapabilities } from "../message/adapters/Adapter";
import * as pty from "./ptyClient";

/**
 * One terminal session: an xterm.js instance bound to one PTY.
 *
 * The DOM element is owned by this class rather than by React, so a session
 * keeps its scrollback and viewport when its tab is hidden and shown again.
 * React only decides where the element is mounted.
 */
export class TerminalInstance {
  readonly element: HTMLDivElement;
  private readonly term: Terminal;
  private readonly fitAddon: FitAddon;
  private readonly disposers: Array<() => void> = [];
  private resizeObserver?: ResizeObserver;
  private disposed = false;

  private constructor(readonly session: pty.PtySessionInfo) {
    this.element = document.createElement("div");
    this.element.className = "terminal-surface";

    this.term = new Terminal({
      fontFamily:
        'ui-monospace, "JetBrains Mono", "Fira Code", "DejaVu Sans Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10_000,
      allowProposedApi: true,
      theme: {
        background: "#101014",
        foreground: "#d7d7dc",
        cursor: "#8ab4f8",
        selectionBackground: "#2f3a4d",
      },
    });
    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.open(this.element);
  }

  static async create(cwd?: string): Promise<TerminalInstance> {
    // Spawn with a plausible size; the first fit() corrects it immediately.
    const session = await pty.spawn({ cwd, cols: 80, rows: 24 });
    const instance = new TerminalInstance(session);
    await instance.bind();
    return instance;
  }

  private async bind(): Promise<void> {
    const { id } = this.session;

    const unlistenOutput = await pty.onOutput(id, (data) => this.term.write(data));
    const unlistenExit = await pty.onExit(id, () => {
      this.term.write("\r\n\x1b[90m[process exited]\x1b[0m\r\n");
    });
    this.disposers.push(unlistenOutput, unlistenExit);

    const onData = this.term.onData((data) => void pty.write(id, data));
    const onResize = this.term.onResize(({ cols, rows }) =>
      void pty.resize(id, cols, rows),
    );
    this.disposers.push(() => onData.dispose(), () => onResize.dispose());
  }

  /** Mounts the terminal into a container and keeps it fitted to its size. */
  attach(container: HTMLElement): void {
    container.appendChild(this.element);
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);
    this.fit();
  }

  detach(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.element.remove();
  }

  fit(): void {
    if (this.disposed || this.element.clientHeight === 0) return;
    try {
      this.fitAddon.fit();
    } catch {
      // fit() throws while the element is detached or has no size yet.
    }
  }

  focus(): void {
    this.term.focus();
  }

  blur(): void {
    this.term.blur();
  }

  /** Writes composer output (already serialized by an adapter) into the PTY. */
  submit(payload: string): void {
    if (payload) void pty.write(this.session.id, payload);
  }

  /**
   * What the program on the other end currently supports. xterm.js tracks the
   * modes that program has enabled, which is the only reliable source.
   */
  get capabilities(): TargetCapabilities {
    return { bracketedPaste: this.term.modes.bracketedPasteMode };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    for (const dispose of this.disposers) dispose();
    this.term.dispose();
    await pty.close(this.session.id);
  }
}
