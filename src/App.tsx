import { useCallback, useEffect, useRef, useState } from "react";

import { useFocusStore } from "./app/focusStore";
import { useFocusHotkeys } from "./app/useFocusHotkeys";
import { Composer } from "./composer/Composer";
import { getAdapter } from "./message/adapters/registry";
import { isEmptyMessage, type Message } from "./message/types";
import { TerminalInstance } from "./terminal/TerminalInstance";
import { TerminalView } from "./terminal/TerminalView";

/** How much of the composer stays visible while the terminal is active. */
const PEEK_HEIGHT = 44;
const SLIDE_MS = 160;

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

  const handleInterrupt = useCallback(() => {
    if (!instance) return;
    void instance.submit(getAdapter().interrupt());
  }, [instance]);

  const collapsed = pane === "terminal";
  const { height, animate, contentRef } = useComposerSlide(collapsed);

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
        <div className="app__composer-inner" ref={contentRef}>
          <Composer
            onSubmit={handleSubmit}
            onAbort={handleAbort}
            onInterrupt={handleInterrupt}
            disabled={!instance}
          />
        </div>
      </footer>
    </div>
  );
}

/**
 * The composer grows with its content and the terminal gives up the space.
 * Where it stops growing is a CSS decision (`max-height` on the editor
 * surface), so this hook only has to follow the content's natural height.
 *
 * The height transition is switched on only around a pane change, so growing
 * while typing stays immediate instead of lagging behind an animation.
 */
function useComposerSlide(collapsed: boolean) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(PEEK_HEIGHT);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    setHeight(element.offsetHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setAnimate(true);
    const timer = setTimeout(() => setAnimate(false), SLIDE_MS + 40);
    return () => clearTimeout(timer);
  }, [collapsed]);

  return { height, animate, contentRef };
}
