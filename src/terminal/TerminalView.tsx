import { useEffect, useRef } from "react";

import { useFocusStore } from "../app/focusStore";
import { useTabsStore } from "../app/tabsStore";
import type { TerminalInstance } from "./TerminalInstance";

interface TerminalViewProps {
  instance: TerminalInstance;
  /** Whether its tab is the one on screen. */
  active: boolean;
  /**
   * Whether it is the one of several in its tab that has the keyboard. Only
   * marked when there are several: a lone terminal needs no frame to say so.
   */
  focused?: boolean;
}

/**
 * Hosts a `TerminalInstance`'s DOM node; owns no terminal state itself.
 *
 * Every session stays mounted and inactive ones are only hidden, which is what
 * keeps their scrollback, viewport and running programs intact across switches.
 */
export function TerminalView({ instance, active, focused = false }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const focusPane = useFocusStore((state) => state.focusPane);
  const focusSplit = useTabsStore((state) => state.focusPane);

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
      className={`terminal-view${active ? "" : " terminal-view--hidden"}${
        focused ? " terminal-view--focused" : ""
      }`}
      onMouseDown={() => {
        focusSplit(instance.session.id);
        focusPane("terminal");
      }}
    />
  );
}
