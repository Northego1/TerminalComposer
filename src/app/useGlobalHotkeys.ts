import { useEffect, useRef } from "react";

import { useFocusStore } from "./focusStore";
import { DEFAULT_SETTINGS, useSettingsStore } from "./settingsStore";
import { getInstance, useTabsStore } from "./tabsStore";

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
 * It is also free at the desktop level, unlike Ctrl+Alt with the arrows, which
 * GNOME reserves for switching workspaces.
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
  const tabs = useTabsStore.getState();
  const { ctrlKey, shiftKey, altKey, metaKey, code } = event;
  if (metaKey) return false;

  // Panes. Ctrl+Shift rather than Ctrl+Alt, because GNOME takes Ctrl+Alt with
  // the arrows for switching workspaces and the app never sees it.
  if (ctrlKey && shiftKey && !altKey) {
    // Up opens the composer and down puts it away, matching the handle that
    // points up from the collapsed strip.
    if (code === "ArrowUp") return focus("composer");
    if (code === "ArrowDown") return focus("terminal");
  }

  // Jump to a tab by position.
  if (altKey && !ctrlKey && !shiftKey && /^Digit[1-9]$/.test(code)) {
    const tab = tabs.tabs[Number(code.slice(5)) - 1];
    if (!tab) return false;
    tabs.activate(tab.id);
    return true;
  }

  if (!ctrlKey || altKey) return false;

  if (shiftKey) {
    switch (code) {
      case "KeyT":
        void tabs.openTerminal();
        return true;
      case "KeyP":
        useFocusStore.getState().togglePinned();
        return true;
      case "KeyW":
        if (!tabs.activeId) return false;
        void tabs.close(tabs.activeId);
        return true;
      case "Tab":
        return step(-1);
      case "KeyC":
        return copySelection();
      case "KeyV":
        void pasteIntoTerminal();
        return true;
      // "+" is Shift+= on most layouts.
      case "Equal":
        return zoom(1);
      default:
        return false;
    }
  }

  if (code === "Tab") return step(1);
  if (code === "KeyF") {
    openSearch();
    return true;
  }

  // Zoom, the way a terminal means it: the terminal's own font size, which is
  // a setting, so it survives a restart like every other one.
  if (code === "Equal" || code === "NumpadAdd") return zoom(1);
  if (code === "Minus" || code === "NumpadSubtract") return zoom(-1);
  if (code === "Digit0" || code === "Numpad0") return zoom(0);

  return false;
}

const FONT_SIZE_RANGE = { min: 8, max: 32 };

function zoom(direction: 1 | -1 | 0): boolean {
  const { settings, update } = useSettingsStore.getState();
  const fontSize =
    direction === 0
      ? DEFAULT_SETTINGS.fontSize
      : Math.min(
          Math.max(settings.fontSize + direction, FONT_SIZE_RANGE.min),
          FONT_SIZE_RANGE.max,
        );
  if (fontSize !== settings.fontSize) update({ fontSize });
  return true;
}

function focus(pane: "terminal" | "composer"): boolean {
  useFocusStore.getState().focusPane(pane);
  return true;
}

function step(direction: 1 | -1): boolean {
  const { tabs, activeId, activate } = useTabsStore.getState();
  if (tabs.length < 2) return true;
  const index = tabs.findIndex((tab) => tab.id === activeId);
  const next = (index + direction + tabs.length) % tabs.length;
  activate(tabs[next].id);
  return true;
}

function copySelection(): boolean {
  const selection = getInstance(useTabsStore.getState().activeId)?.selection();
  if (!selection) return false;
  void import("@tauri-apps/plugin-clipboard-manager").then(({ writeText }) =>
    writeText(selection),
  );
  return true;
}

async function pasteIntoTerminal(): Promise<void> {
  const instance = getInstance(useTabsStore.getState().activeId);
  if (!instance) return;
  const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
  const text = await readText().catch(() => "");
  if (text) instance.paste(text);
}
