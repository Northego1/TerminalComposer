import { useEffect } from "react";

import { useFocusStore } from "./focusStore";

/**
 * Global pane-switch keys, handled on the capture phase so they never reach
 * xterm.js or the composer editor.
 */
export function useFocusHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.shiftKey) return;
      const target =
        event.key === "ArrowUp"
          ? "terminal"
          : event.key === "ArrowDown"
            ? "composer"
            : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      useFocusStore.getState().focusPane(target);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
