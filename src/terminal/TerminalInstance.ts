import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";

import type { Settings } from "../app/settingsStore";
import { t } from "../i18n";
import { THEMES } from "../app/theme";
import type {
  PtyWrite,
  TargetCapabilities,
} from "../message/adapters/Adapter";
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
  private readonly searchAddon: SearchAddon;
  private readonly disposers: Array<() => void> = [];
  private resizeObserver?: ResizeObserver;
  private disposed = false;
  /** Input waiting to be written; see `writeInput`. */
  private pendingInput = "";
  private writing = false;
  private lastSize = { cols: 0, rows: 0 };

  private constructor(readonly session: pty.PtySessionInfo, settings: Settings) {
    this.element = document.createElement("div");
    this.element.className = "terminal-surface";

    this.term = new Terminal({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      scrollback: settings.scrollback,
      theme: THEMES[settings.theme].terminal,
      cursorBlink: true,
      allowProposedApi: true,
    });
    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.searchAddon = new SearchAddon();
    this.term.loadAddon(this.searchAddon);
    this.term.attachCustomKeyEventHandler((event) => this.handleKey(event));
    this.term.open(this.element);
  }

  static async create(
    settings: Settings,
    spawn: { cwd?: string; shell?: string } = {},
  ): Promise<TerminalInstance> {
    // Spawn with a plausible size; the first fit() corrects it immediately.
    const session = await pty.spawn({
      cwd: spawn.cwd || settings.cwd || undefined,
      shell: spawn.shell || settings.shell || undefined,
      cols: 80,
      rows: 24,
    });
    const instance = new TerminalInstance(session, settings);
    await instance.bind();
    return instance;
  }

  /** Applies changed settings to a terminal that is already running. */
  applySettings(settings: Settings): void {
    this.term.options.fontFamily = settings.fontFamily;
    this.term.options.fontSize = settings.fontSize;
    this.term.options.scrollback = settings.scrollback;
    this.term.options.theme = THEMES[settings.theme].terminal;
    this.fit();
  }

  /** The selected text, or an empty string. */
  selection(): string {
    return this.term.getSelection();
  }

  /** Pastes text as the terminal itself would, bracketed paste included. */
  paste(text: string): void {
    this.term.paste(text);
  }

  private async bind(): Promise<void> {
    const { id } = this.session;

    const unlistenOutput = await pty.onOutput(id, (data) => this.term.write(data));
    const unlistenExit = await pty.onExit(id, () => {
      this.term.write(`\r\n\x1b[90m${t("terminal.exited")}\x1b[0m\r\n`);
    });
    this.disposers.push(unlistenOutput, unlistenExit);

    const onData = this.term.onData((data) => this.writeInput(data));
    const onResize = this.term.onResize(({ cols, rows }) => {
      // Resizing a PTY makes the program redraw, so only tell it about sizes
      // that actually changed -- a pane animation fires many equal ones.
      if (cols === this.lastSize.cols && rows === this.lastSize.rows) return;
      this.lastSize = { cols, rows };
      void pty.resize(id, cols, rows);
    });
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

  /**
   * Performs the writes an adapter produced for one submission, honouring the
   * pauses it asked for.
   */
  async submit(writes: PtyWrite[]): Promise<void> {
    for (const write of writes) {
      if (write.delayBefore) await sleep(write.delayBefore);
      if (this.disposed) return;
      this.writeInput(write.data);
    }
  }

  /**
   * The one way input reaches the PTY, and it is deliberately a queue.
   *
   * Every `invoke` is an independent IPC message and Tauri is free to handle
   * them concurrently, so firing one per keystroke lets fast typing arrive at
   * the shell out of order. Keeping a single write in flight and coalescing
   * whatever piles up behind it guarantees order and cuts the number of round
   * trips at the same time.
   */
  private writeInput(data: string): void {
    if (!data || this.disposed) return;
    this.pendingInput += data;
    void this.flushInput();
  }

  private async flushInput(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.pendingInput && !this.disposed) {
        const chunk = this.pendingInput;
        this.pendingInput = "";
        await pty.write(this.session.id, chunk);
      }
    } catch {
      // The session is gone; the exit event already told the user.
      this.pendingInput = "";
    } finally {
      this.writing = false;
    }
  }

  /**
   * What the program on the other end currently supports. xterm.js tracks the
   * modes that program has enabled, which is the only reliable source.
   */
  get capabilities(): TargetCapabilities {
    return { bracketedPaste: this.term.modes.bracketedPasteMode };
  }

  /**
   * Keys, resolved without `event.keyCode`.
   *
   * xterm.js derives both control characters and printable input from
   * `keyCode` -- Ctrl+letter from the range 65..90, and a character only when
   * `keyCode >= 48`. WebKitGTK does not report the physical key there for
   * non-Latin layouts, so with a Cyrillic layout active Ctrl+C never became
   * 0x03 and typed letters either vanished or arrived twice, once through the
   * key handler and once through the hidden textarea.
   *
   * Resolving from `event.code` (the physical key) and `event.key` (the
   * character) removes that dependency. What we handle is fed back through
   * xterm's own input path, so ordering, scrolling and the write queue all
   * behave exactly as they do for keys we leave alone.
   */
  private handleKey(event: KeyboardEvent): boolean {
    if (event.type !== "keydown") return true;

    const data = translateKey(event);
    if (data === null) return true;

    // Without this the character would also reach the hidden textarea and be
    // sent a second time.
    event.preventDefault();
    this.term.input(data);
    return false;
  }

  /** Scrollback search. Returns whether anything matched. */
  findNext(term: string): boolean {
    return this.searchAddon.findNext(term, SEARCH_OPTIONS);
  }

  findPrevious(term: string): boolean {
    return this.searchAddon.findPrevious(term, SEARCH_OPTIONS);
  }

  /**
   * Reports which match is active and how many there are. Only fires while
   * decorations are on, which is why searches always pass `SEARCH_OPTIONS`.
   */
  onSearchResults(
    handler: (results: { index: number; count: number }) => void,
  ): () => void {
    const subscription = this.searchAddon.onDidChangeResults(
      ({ resultIndex, resultCount }) =>
        handler({ index: resultIndex, count: resultCount }),
    );
    return () => subscription.dispose();
  }

  clearSearch(): void {
    this.searchAddon.clearDecorations();
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

/**
 * Every match is bright blue; the one you are on is bright orange. The two are
 * complementary, so the active match is unmistakable among the others, and both
 * stay readable under the terminal's light foreground.
 *
 * Deferred: the addon also takes `regex`, `caseSensitive` and `wholeWord`, so
 * pattern search is these options plus the toggles to drive them -- no new
 * search machinery.
 */
const SEARCH_OPTIONS = {
  decorations: {
    matchBackground: "#2f6fe0",
    matchBorder: "#5b93f5",
    matchOverviewRuler: "#2f6fe0",
    activeMatchBackground: "#e8590c",
    activeMatchBorder: "#ff9d5c",
    activeMatchColorOverviewRuler: "#e8590c",
  },
};

/**
 * The bytes a key press should send, or null to leave it to xterm.
 *
 * Only the two cases xterm gets wrong on this platform are taken over:
 * control characters and plain characters. Everything with a special meaning --
 * arrows, function keys, IME composition -- is left alone.
 */
function translateKey(event: KeyboardEvent): string | null {
  if (event.altKey || event.metaKey) return null;

  if (event.ctrlKey) {
    // Ctrl+Shift belongs to the application, not to the terminal.
    if (event.shiftKey) return null;
    return controlCharacter(event.code);
  }

  // Mid-composition the textarea owns the input, and it must keep it.
  if (event.isComposing || event.keyCode === 229) return null;

  return event.key.length === 1 ? event.key : null;
}

function controlCharacter(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return String.fromCharCode(code.charCodeAt(3) - 64);
  }
  switch (code) {
    case "Space":
      return "\x00";
    case "BracketLeft":
      return "\x1b";
    case "Backslash":
      return "\x1c";
    case "BracketRight":
      return "\x1d";
    case "Slash":
      return "\x1f";
    default:
      return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
