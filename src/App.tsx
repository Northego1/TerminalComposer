import { useCallback, useEffect, useState } from "react";

import { useFocusStore } from "./app/focusStore";
import { useFocusHotkeys } from "./app/useFocusHotkeys";
import { Composer } from "./composer/Composer";
import { ComposerResizer } from "./composer/ComposerResizer";
import { getAdapter } from "./message/adapters/registry";
import { isEmptyMessage, type Message } from "./message/types";
import { TerminalInstance } from "./terminal/TerminalInstance";
import { TerminalView } from "./terminal/TerminalView";

/** How much of the composer stays visible while the terminal is active. */
const PEEK_HEIGHT = 44;
const SLIDE_MS = 160;
const MIN_COMPOSER_HEIGHT = 96;
const DEFAULT_COMPOSER_HEIGHT = 170;

/**
 * Layout: one terminal on top, the composer below.
 *
 * There is one input mode, not two: whichever pane is active gets the keyboard,
 * and the composer slides down to a peeking strip while the terminal has it.
 * Clicking the strip brings it back.
 *
 * This component is also where the submission path is wired together:
 *
 *   Composer -> Message -> Adapter -> TerminalInstance (PTY)
 *
 * The composer produces the message, the adapter decides how it is written,
 * and neither knows about the other.
 */
export default function App() {
  const [instance, setInstance] = useState<TerminalInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pane = useFocusStore((state) => state.pane);
  const focusPane = useFocusStore((state) => state.focusPane);
  useFocusHotkeys();

  useEffect(() => {
    let cancelled = false;
    let created: TerminalInstance | null = null;

    TerminalInstance.create()
      .then((terminal) => {
        created = terminal;
        if (cancelled) return void terminal.dispose();
        setInstance(terminal);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(String(cause));
      });

    return () => {
      cancelled = true;
      void created?.dispose();
      setInstance(null);
    };
  }, []);

  useEffect(() => {
    if (!instance) return;
    if (pane === "terminal") instance.focus();
    else instance.blur();
  }, [pane, instance]);

  const handleSubmit = useCallback(
    (message: Message) => {
      if (!instance || isEmptyMessage(message)) return;
      void instance.submit(getAdapter().serialize(message, instance.capabilities));
    },
    [instance],
  );

  const handleAbort = useCallback(() => {
    if (!instance) return;
    void instance.submit(getAdapter().abort());
  }, [instance]);

  const collapsed = pane === "terminal";
  const { height, setHeight, animate } = useComposerHeight(collapsed);

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__title">Terminal Composer</span>
        <span className="app__subtitle">
          {instance ? `${instance.session.shell} · ${instance.session.cwd}` : "…"}
        </span>
      </header>

      <main className="app__body">
        {error ? (
          <div className="app__error">Не удалось запустить shell: {error}</div>
        ) : (
          <TerminalView instance={instance} />
        )}
      </main>

      <footer
        className={[
          "app__composer",
          collapsed ? "app__composer--peek" : "",
          animate ? "app__composer--animate" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ height: collapsed ? PEEK_HEIGHT : height }}
        title={collapsed ? "Открыть composer" : undefined}
        onMouseDown={collapsed ? () => focusPane("composer") : undefined}
      >
        <div className="app__composer-inner" style={{ height }}>
          <ComposerResizer height={height} onResize={setHeight} />
          <Composer
            onSubmit={handleSubmit}
            onAbort={handleAbort}
            disabled={!instance}
          />
        </div>
      </footer>
    </div>
  );
}

/**
 * The composer's height, and the slide-down that hides it behind a peeking
 * strip while the terminal is active.
 *
 * The height transition is switched on only around a pane change, so dragging
 * the composer taller stays immediate instead of lagging behind an animation.
 */
function useComposerHeight(collapsed: boolean) {
  const [height, setRawHeight] = useState(DEFAULT_COMPOSER_HEIGHT);
  const [animate, setAnimate] = useState(false);

  const setHeight = useCallback((next: number) => {
    const max = Math.max(MIN_COMPOSER_HEIGHT, window.innerHeight * 0.7);
    setRawHeight(Math.min(Math.max(next, MIN_COMPOSER_HEIGHT), max));
  }, []);

  useEffect(() => {
    setAnimate(true);
    const timer = setTimeout(() => setAnimate(false), SLIDE_MS + 40);
    return () => clearTimeout(timer);
  }, [collapsed]);

  return { height, setHeight, animate };
}
