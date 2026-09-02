import { useEffect, useRef } from "react";

import { useFocusStore } from "./focusStore";
import { getInstance, useSessionsStore } from "./sessionsStore";

interface GlobalHotkeys {
  openSearch: () => void;
}

/**
 * Keys that belong to the window rather than to a pane, handled on the capture
 * phase so they never reach xterm.js or the composer editor.
 *
 * Shortcuts are matched on `event.code` -- the physical key -- because
 * `event.key` is whatever the current keyboard layout produces, and with a
 * Cyrillic layout active Ctrl+Shift+T arrives as "е".
 *
 * Ctrl+Shift is the terminal convention precisely because programs running
 * inside a terminal never claim it, so nothing here is taken away from them.
 */
export function useGlobalHotkeys(handlers: GlobalHotkeys): void {
  const current = useRef(handlers);
  useEffect(() => {
    current.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const handled = route(event, () => current.current.openSearch());
      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}

function route(event: KeyboardEvent, openSearch: () => void): boolean {
  const sessions = useSessionsStore.getState();
  const { ctrlKey, shiftKey, altKey, metaKey, code } = event;
  if (metaKey) return false;

  // Panes.
  if (ctrlKey && altKey && !shiftKey) {
    if (event.key === "ArrowUp") return focus("terminal");
    if (event.key === "ArrowDown") return focus("composer");
    return false;
  }

  // Jump to a terminal by position.
  if (altKey && !ctrlKey && !shiftKey && /^Digit[1-9]$/.test(code)) {
    const session = sessions.sessions[Number(code.slice(5)) - 1];
    if (!session) return false;
    sessions.activate(session.id);
    return true;
  }

  if (!ctrlKey || altKey) return false;

  if (shiftKey) {
    switch (code) {
      case "KeyT":
        void sessions.open();
        return true;
      case "KeyW":
        if (!sessions.activeId) return false;
        void sessions.close(sessions.activeId);
        return true;
      case "Tab":
        return step(-1);
      case "KeyC":
        return copySelection();
      case "KeyV":
        void pasteIntoTerminal();
        return true;
      default:
        return false;
    }
  }

  if (code === "Tab") return step(1);
  if (code === "KeyF") {
    openSearch();
    return true;
  }
  return false;
}

function focus(pane: "terminal" | "composer"): boolean {
  useFocusStore.getState().focusPane(pane);
  return true;
}

function step(direction: 1 | -1): boolean {
  const { sessions, activeId, activate } = useSessionsStore.getState();
  if (sessions.length < 2) return true;
  const index = sessions.findIndex((session) => session.id === activeId);
  const next = (index + direction + sessions.length) % sessions.length;
  activate(sessions[next].id);
  return true;
}

function copySelection(): boolean {
  const selection = getInstance(useSessionsStore.getState().activeId)?.selection();
  if (!selection) return false;
  void import("@tauri-apps/plugin-clipboard-manager").then(({ writeText }) =>
    writeText(selection),
  );
  return true;
}

async function pasteIntoTerminal(): Promise<void> {
  const instance = getInstance(useSessionsStore.getState().activeId);
  if (!instance) return;
  const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
  const text = await readText().catch(() => "");
  if (text) instance.paste(text);
}
