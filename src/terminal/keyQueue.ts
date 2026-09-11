/**
 * Keys on their way to the PTY, in the order they were pressed.
 *
 * Most keys are readable the moment they are pressed and go straight out. A
 * key of a non-Latin layout is not: WebKitGTK hands it to the platform input
 * method, and its letter arrives afterwards -- from the composition, or,
 * when the input method's context has just been recreated and the composition
 * was cancelled with it, only from the release.
 *
 * So a press whose letter is not known yet takes its place in the queue and
 * everything typed after it waits behind it. Without that a space typed
 * during a letter overtakes it: "в админку" arrives as " вадминку".
 */
export class KeyQueue {
  /** `null` is a letter still unknown; `""` a press that carries none. */
  private readonly keys: Key[] = [];
  /**
   * The presses the input method has taken and not yet given back, oldest
   * first -- the same objects as in `keys`, which is what lets a letter be
   * matched to the press it belongs to rather than to a count.
   */
  private readonly held: Key[] = [];
  /** Whether the input method is composing for real, with pre-edit on screen. */
  private composing = false;

  constructor(private readonly send: (data: string) => void) {}

  /** Whether anything is waiting on a letter that has not arrived. */
  get waiting(): boolean {
    return this.keys.some((key) => key.data === null);
  }

  /** A key that carries its own character. */
  type(data: string): void {
    if (!this.keys.length) {
      this.send(data);
      return;
    }
    this.keys.push({ data });
  }

  /** A press the input method took, whose letter is not readable yet. */
  press(): void {
    const key: Key = { data: null };
    this.keys.push(key);
    this.held.push(key);
  }

  /**
   * A letter the composition produced. It belongs to the press it followed --
   * the most recent one still without a letter -- because a composition
   * arrives before the next key is even pressed.
   */
  composed(data: string): void {
    for (let index = this.held.length - 1; index >= 0; index -= 1) {
      const key = this.held[index];
      if (key.data !== null) continue;
      key.data = data;
      break;
    }
    this.flush();
  }

  /**
   * A release of a key the input method took. It answers the oldest press
   * still held, and names the letter that press should have produced.
   *
   * Returns whether it was one of ours: a release with no press behind it is
   * not the input method's -- a letter released after its modifier (Ctrl+U on
   * a Cyrillic layout releases "г") reports the same empty `keyCode`.
   */
  release(key: string): boolean {
    const pressed = this.held.shift();
    if (!pressed) return false;

    // A press the composition already answered has its letter; this release
    // only closes it.
    if (pressed.data === null) {
      // Anything that is not a single character is a name -- "Shift", "Enter"
      // -- and a composition that is really composing owns its keys outright:
      // there the presses are the input method's own alphabet, not text.
      // Either way the press carries nothing, and nothing may wait on it.
      pressed.data = !this.composing && [...key].length === 1 ? key : "";
    }
    this.flush();
    return true;
  }

  setComposing(composing: boolean): void {
    this.composing = composing;
  }

  /**
   * Writes out every key at the front whose letter is known, stopping at the
   * first one still waiting for its release.
   *
   * `all` gives up on the ones still waiting rather than holding the keys
   * behind them for ever -- for a press whose release never comes, and for a
   * queue abandoned because the keyboard moved to another pane.
   */
  flush(all = false): void {
    while (this.keys.length) {
      const next = this.keys[0];
      if (next.data === null && !all) break;
      this.keys.shift();
      if (next.data) this.send(next.data);
    }
    if (all) {
      this.held.length = 0;
      this.composing = false;
    }
  }
}

/** One key, waiting for its letter to be known. */
interface Key {
  data: string | null;
}
