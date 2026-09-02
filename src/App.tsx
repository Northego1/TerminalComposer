import { useCallback, useEffect, useRef, useState } from "react";

import { useFocusStore } from "./app/focusStore";
import { forEachInstance, getInstance, useTabsStore } from "./app/tabsStore";
import type { ShellState } from "./terminal/TerminalInstance";
import { applySettingsToDocument, useSettingsStore } from "./app/settingsStore";
import { useGlobalHotkeys } from "./app/useGlobalHotkeys";
import { readWorkspace, scheduleWorkspaceSave } from "./app/workspace";
import { Composer } from "./composer/Composer";
import { saveComposerState } from "./composer/state/drafts";
import { useT } from "./i18n";
import { getAdapter } from "./message/adapters/registry";
import { isEmptyMessage, type Message } from "./message/types";
import { SettingsView } from "./settings/SettingsView";
import { Sidebar } from "./sidebar/Sidebar";
import { TerminalSearch } from "./terminal/TerminalSearch";
import { TerminalView } from "./terminal/TerminalView";
import { FileViewer } from "./viewer/FileViewer";
import { ViewerTabs } from "./viewer/ViewerTabs";

/**
 * How much of the composer stays visible while the terminal is active: just the
 * top edge of its box, so the terminal keeps almost all the room.
 */
const PEEK_HEIGHT = 20;

/** How far above that edge the handle floats. */
const HANDLE_GAP = 6;
const SLIDE_MS = 160;

/**
 * Layout: tabs on the left, the active one on the right. A terminal tab also
 * gets the composer under it; a settings tab does not.
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
 * and neither knows about the other. One composer serves every terminal and
 * always talks to the active one.
 */
export default function App() {
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId);
  const error = useTabsStore((state) => state.error);
  const settings = useSettingsStore((state) => state.settings);
  const pane = useFocusStore((state) => state.pane);
  const focusPane = useFocusStore((state) => state.focusPane);
  const suggestPane = useFocusStore((state) => state.suggestPane);
  const [searching, setSearching] = useState(false);
  const t = useT();
  useGlobalHotkeys({ openSearch: () => setSearching(true) });

  useEffect(() => {
    void start();
  }, []);

  // Settings apply to the interface and to every terminal already running.
  useEffect(() => {
    applySettingsToDocument(settings);
    forEachInstance((instance) => instance.applySettings(settings));
  }, [settings]);

  // Anything that changes the tabs is worth remembering for next time.
  useEffect(() => useTabsStore.subscribe(scheduleWorkspaceSave), []);

  // A file name clicked in any terminal opens next to it.
  useEffect(() => {
    forEachInstance((instance) => {
      instance.openFile = (path) => useTabsStore.getState().openFile(path);
    });
  }, [tabs]);

  /**
   * The active pane actually holds the keyboard.
   *
   * Which pane is active is a value in a store, and this is what makes the
   * browser agree with it -- without it the state can say "the terminal" while
   * the keys go somewhere else entirely.
   */
  useEffect(() => {
    const instance = getInstance(activeId);
    if (!instance) return;
    if (pane === "terminal") instance.focus();
    else instance.blur();
  }, [pane, activeId]);

  /**
   * Never leave the keyboard with nobody.
   *
   * Controls in the chrome are told not to take it, but a click on a gap
   * between them still lands on the page itself, and the next keystroke would
   * go nowhere. Whenever that happens the active pane takes it back.
   */
  useEffect(() => {
    const restore = () => {
      if (document.activeElement && document.activeElement !== document.body) return;
      if (useFocusStore.getState().pane === "terminal") {
        getInstance(useTabsStore.getState().activeId)?.focus();
      } else {
        document.querySelector<HTMLElement>(".composer__editor")?.focus();
      }
    };
    document.addEventListener("mouseup", restore);
    return () => document.removeEventListener("mouseup", restore);
  }, []);

  /**
   * Who owns the keyboard, decided by what the shell reports about itself.
   *
   * Waiting for a command -> the composer, which is where commands are written.
   * Running one -> the terminal, whatever is running there. Nothing is inferred
   * from the output, so no program can be a special case; and without the
   * integration the shell says nothing and neither does this.
   */
  const [shellState, setShellState] = useState<ShellState>("unknown");
  const viewers = useTabsStore((state) => state.viewers);
  const showFile = useTabsStore((state) => state.showFile);
  const closeFile = useTabsStore((state) => state.closeFile);
  /** The files the active terminal has open, and which of them is on screen. */
  const viewing = activeId ? viewers[activeId] : undefined;
  const viewingFile = viewing?.active ?? null;

  useEffect(() => {
    const instance = getInstance(activeId);
    setShellState(instance?.shellState ?? "unknown");
    return instance?.onShellStateChange((state) => {
      setShellState(state);
      if (state === "prompt") suggestPane("composer");
      else if (state === "running") suggestPane("terminal");
    });
  }, [activeId, suggestPane]);

  const handleSubmit = useCallback(
    (message: Message) => {
      const instance = getInstance(useTabsStore.getState().activeId);
      if (!instance || isEmptyMessage(message)) return;
      void instance.submit(getAdapter().serialize(message, instance.capabilities));
      // Whatever was sent, the answer comes back in the terminal -- output, a
      // question, a picker. This needs no signal at all: we know we just sent
      // something. The keyboard comes back on its own when the shell returns to
      // its prompt.
      suggestPane("terminal");
    },
    [suggestPane],
  );


  const handleAbort = useCallback(() => {
    getInstance(useTabsStore.getState().activeId)?.submit(getAdapter().abort());
  }, []);

  const handleInterrupt = useCallback(() => {
    getInstance(useTabsStore.getState().activeId)?.submit(getAdapter().interrupt());
  }, []);

  const active = tabs.find((tab) => tab.id === activeId);
  const onTerminal = active?.kind === "terminal";
  const collapsed = pane === "terminal";
  const { height, animate, contentRef } = useComposerSlide(collapsed);

  return (
    <div className="app">
      <Sidebar />

      <div className="app__main">
        <header className="app__header">
          <span className="app__title">{active?.name ?? "Terminal Composer"}</span>
          <span className="app__subtitle">
            {active?.kind === "terminal" ? `${active.shell} · ${active.cwd}` : ""}
          </span>
          {/* Says why the keyboard is where it is, rather than leaving it to be
              worked out from the composer collapsing. */}
          {onTerminal && shellState !== "unknown" && (
            <span
              className={`app__badge app__badge--${shellState}`}
              title={active?.kind === "terminal" ? active.shell : undefined}
            >
              {t(shellState === "running" ? "app.shell.running" : "app.shell.prompt")}
            </span>
          )}
        </header>

        {onTerminal && viewing && viewing.paths.length > 0 && activeId && (
          <ViewerTabs
            terminalName={active?.name ?? ""}
            files={viewing}
            onShow={(path) => showFile(activeId, path)}
            onClose={(path) => closeFile(activeId, path)}
          />
        )}

        <main className="app__body">
          {searching && onTerminal && (
            <TerminalSearch
              onClose={() => {
                setSearching(false);
                focusPane("terminal");
              }}
            />
          )}
          {error && (
            <div className="app__error">
              {t("app.error.spawn")} {error}
            </div>
          )}

          {/* The terminals and the settings pages share this column; the
              viewer, when there is one, takes the other. */}
          <div
            className={`app__terminals${viewingFile ? " app__terminals--hidden" : ""}`}
          >
            {/* Every tab stays mounted; only the active one is shown. */}
            {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            if (tab.kind === "settings") {
              return (
                <div
                  key={tab.id}
                  className={`app__pane${isActive ? "" : " app__pane--hidden"}`}
                >
                  <SettingsView />
                </div>
              );
            }
            const instance = getInstance(tab.id);
              return (
                instance && (
                  <TerminalView key={tab.id} instance={instance} active={isActive} />
                )
              );
            })}
          </div>

          {viewingFile && onTerminal && <FileViewer path={viewingFile} />}
        </main>

        {collapsed && onTerminal && !viewingFile && (
          <button
            type="button"
            className="composer-peek"
            style={{ bottom: PEEK_HEIGHT + HANDLE_GAP }}
            onClick={() => focusPane("composer")}
            title={t("composer.expand")}
            aria-label={t("composer.expand")}
          >
            ↑
          </button>
        )}

        <footer
          className={[
            "app__composer",
            onTerminal && !viewingFile ? "" : "app__composer--hidden",
            collapsed ? "app__composer--peek" : "",
            animate ? "app__composer--animate" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ height: collapsed ? PEEK_HEIGHT : height }}
          title={collapsed ? t("composer.expand") : undefined}
          onMouseDown={collapsed ? () => focusPane("composer") : undefined}
        >
          <div className="app__composer-inner" ref={contentRef}>
            <Composer
              onSubmit={handleSubmit}
              onAbort={handleAbort}
              onInterrupt={handleInterrupt}
              disabled={!onTerminal}
            />
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Startup runs once per process, guarded outside React: StrictMode remounts the
 * component and so does Fast Refresh, and each remount would otherwise open
 * another set of tabs.
 */
let starting = false;

/**
 * Settings first, because terminals are created with them, then the tabs that
 * were open last time -- or a fresh terminal on a first run.
 */
async function start(): Promise<void> {
  if (starting) return;
  starting = true;

  await useSettingsStore.getState().load();
  applySettingsToDocument(useSettingsStore.getState().settings);

  const workspace = await readWorkspace();
  const tabs = useTabsStore.getState();

  if (workspace?.tabs.length) {
    await tabs.restore(workspace.tabs, workspace.activeIndex, (id, index) => {
      const composer = workspace.tabs[index]?.composer;
      if (composer) saveComposerState(id, composer);
    });
    return;
  }

  await tabs.openTerminal();
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
