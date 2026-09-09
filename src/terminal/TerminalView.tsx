import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { useFocusStore } from "../app/focusStore";
import { keepFocus } from "../app/keepFocus";
import { useTabsStore } from "../app/tabsStore";
import { useT } from "../i18n";
import { usePaneDrag } from "./paneDrag";
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
  /** Its share of a split tab, as a flex fraction. */
  share?: number;
  /**
   * Whether the tab holds more than this one shell.
   *
   * Moving a shell and closing it are both about its place among others, so
   * neither is offered to a terminal that is the only one there.
   */
  controls?: boolean;
}

/**
 * Hosts a `TerminalInstance`'s DOM node; owns no terminal state itself.
 *
 * Every session stays mounted and inactive ones are only hidden, which is what
 * keeps their scrollback, viewport and running programs intact across switches.
 */
export function TerminalView({
  instance,
  active,
  focused = false,
  share = 1,
  controls = false,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const focusPane = useFocusStore((state) => state.focusPane);
  const focusSplit = useTabsStore((state) => state.focusPane);
  const closePane = useTabsStore((state) => state.closePane);
  const { id } = instance.session;

  const startDrag = usePaneDrag((state) => state.start);
  const over = usePaneDrag((state) => state.over);
  const drop = usePaneDrag((state) => state.drop);
  const dragging = usePaneDrag((state) => state.dragging === id);
  const landing = usePaneDrag((state) =>
    state.target?.id === id ? state.target.side : null,
  );

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

  const onGripDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const grip = event.currentTarget;
    grip.setPointerCapture(event.pointerId);
    startDrag(id);

    const onMove = (move: PointerEvent): void => over(move.clientX, move.clientY);
    const stop = (): void => {
      grip.removeEventListener("pointermove", onMove);
      drop();
    };
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", stop, { once: true });
    grip.addEventListener("pointercancel", stop, { once: true });
  };

  return (
    <div
      // Where a drag is aimed is read off the screen, and this is what tells
      // the pointer which shell it is over.
      data-pane={id}
      className={`terminal-view${active ? "" : " terminal-view--hidden"}${
        focused ? " terminal-view--focused" : ""
      }${dragging ? " terminal-view--dragging" : ""}`}
      style={{ flexGrow: share }}
      onMouseDown={() => {
        focusSplit(id);
        focusPane("terminal");
      }}
    >
      <div className="terminal-view__surface" ref={containerRef} />

      {controls && (
        <div className="terminal-view__controls">
          <button
            type="button"
            className="terminal-view__control"
            {...keepFocus}
            onPointerDown={onGripDown}
            title={t("pane.move")}
            aria-label={t("pane.move")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M1 3h8M1 7h8"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="terminal-view__control terminal-view__control--close"
            {...keepFocus}
            onClick={() => void closePane(id)}
            title={t("pane.close")}
            aria-label={t("pane.close")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2 2l6 6M8 2l-6 6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Where the shell being dragged would land: the half of this terminal
          it would take. */}
      {landing && (
        <div
          className={`terminal-view__landing terminal-view__landing--${landing}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
