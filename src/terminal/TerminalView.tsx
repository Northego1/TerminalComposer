import { useEffect, useRef } from "react";

import { useFocusStore } from "../app/focusStore";
import type { TerminalInstance } from "./TerminalInstance";

interface TerminalViewProps {
  instance: TerminalInstance;
  active: boolean;
}

/**
 * Hosts a `TerminalInstance`'s DOM node; owns no terminal state itself.
 *
 * Every session stays mounted and inactive ones are only hidden, which is what
 * keeps their scrollback, viewport and running programs intact across switches.
 */
export function TerminalView({ instance, active }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const focusPane = useFocusStore((state) => state.focusPane);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    instance.attach(container);
    return () => instance.detach();
  }, [instance]);

  // A hidden terminal has no size to fit to, so it is measured again when shown.
  useEffect(() => {
    if (active) instance.fit();
  }, [instance, active]);

  return (
    <div
      ref={containerRef}
      className={`terminal-view${active ? "" : " terminal-view--hidden"}`}
      onMouseDown={() => focusPane("terminal")}
    />
  );
}
