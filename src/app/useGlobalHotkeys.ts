import { useEffect, useRef } from "react";

import { useFocusStore } from "./focusStore";

interface GlobalHotkeys {
  openSearch: () => void;
}

/**
 * Keys that belong to the window rather than to a pane, handled on the capture
 * phase so they never reach xterm.js or the composer editor.
 *
 * Ctrl shortcuts are matched on `event.code` -- the physical key -- because
 * `event.key` is whatever the current keyboard layout produces, and with a
 * Cyrillic layout active Ctrl+F arrives as "а".
 */
export function useGlobalHotkeys(handlers: GlobalHotkeys): void {
  const current = useRef(handlers);
  useEffect(() => {
    current.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && !event.shiftKey) {
        const pane =
          event.key === "ArrowUp"
            ? "terminal"
            : event.key === "ArrowDown"
              ? "composer"
              : null;
        if (!pane) return;
        event.preventDefault();
        event.stopPropagation();
        useFocusStore.getState().focusPane(pane);
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === "KeyF") {
        event.preventDefault();
        event.stopPropagation();
        current.current.openSearch();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
