import { useEffect, useRef } from "react";

import { useFocusStore } from "../app/focusStore";
import type { TerminalInstance } from "./TerminalInstance";

interface TerminalViewProps {
  instance: TerminalInstance | null;
}

/** Hosts a `TerminalInstance`'s DOM node; owns no terminal state itself. */
export function TerminalView({ instance }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const focusPane = useFocusStore((state) => state.focusPane);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !instance) return;
    instance.attach(container);
    return () => instance.detach();
  }, [instance]);

  return (
    <div
      ref={containerRef}
      className="terminal-view"
      onMouseDown={() => focusPane("terminal")}
    />
  );
}
