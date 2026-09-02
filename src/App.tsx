import { useCallback, useEffect, useState } from "react";

import { useFocusStore } from "./app/focusStore";
import { useFocusHotkeys } from "./app/useFocusHotkeys";
import { Composer } from "./composer/Composer";
import { getAdapter } from "./message/adapters/registry";
import { isEmptyMessage, type Message } from "./message/types";
import { TerminalInstance } from "./terminal/TerminalInstance";
import { TerminalView } from "./terminal/TerminalView";

/**
 * Slice 1 layout: one terminal on top, the composer below.
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
      const payload = getAdapter().serialize(message, instance.capabilities);
      instance.submit(payload);
    },
    [instance],
  );

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

      <footer className="app__composer">
        <Composer onSubmit={handleSubmit} disabled={!instance} />
      </footer>
    </div>
  );
}
