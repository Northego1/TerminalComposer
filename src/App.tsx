import { useCallback, useEffect, useRef, useState } from "react";

import { hooksInstalled, installHooks, onAgentEvent, removeHooks } from "./agent/events";
import { useFocusStore } from "./app/focusStore";
import {
  activeSession,
  forEachInstance,
  getInstance,
  selectActivePane,
  selectActiveSession,
  useTabsStore,
} from "./app/tabsStore";
import type { ShellState } from "./terminal/TerminalInstance";
import { applySettingsToDocument, useSettingsStore } from "./app/settingsStore";
import { useGlobalHotkeys } from "./app/useGlobalHotkeys";
import { WindowControls } from "./app/WindowControls";
import { readWorkspace, scheduleWorkspaceSave } from "./app/workspace";
import { Composer } from "./composer/Composer";
import { saveComposerState } from "./composer/state/drafts";
import { setSharedHistory } from "./composer/state/sharedHistory";
import { EMPTY_HISTORY, remember, type History } from "./composer/state/history";
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
  /** The shell the keyboard reaches: the focused pane of the tab on screen. */
  const sessionId = useTabsStore(selectActiveSession);
  const activePane = useTabsStore(selectActivePane);
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

  // Temporary: which element had the keyboard when a key arrived, so a letter
  // that lands in the wrong pane can be told from one that lands in both.
  // Settings apply to the interface and to every terminal already running.
  useEffect(() => {
    applySettingsToDocument(settings);
    forEachInstance((instance) => instance.applySettings(settings));
  }, [settings]);

  // The agent's hooks follow the setting, in both directions.
  useEffect(() => {
    void syncAgentHooks(settings.agentHooks);
  }, [settings.agentHooks]);

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
    // Every other shell loses the blinking cursor as well as the keys, so two
    // panes side by side never both claim to be the one being typed into.
    forEachInstance((instance) => {
      if (instance.session.id !== sessionId) instance.blur();
    });
    const instance = getInstance(sessionId);
    if (!instance) return;
    if (pane === "terminal") instance.focus();
    else instance.blur();
  }, [pane, sessionId]);

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
        getInstance(activeSession())?.focus();
      } else {
        document.querySelector<HTMLElement>(".composer__editor")?.focus();
      }
    };
    document.addEventListener("mouseup", restore);
    return () => document.removeEventListener("mouseup", restore);
  }, []);

  /**
   * What the agent in each terminal reports about itself, and where that puts
   * the keyboard.
   *
   * This closes the loop the shell alone cannot: to a shell an agent is one
   * command that runs for hours, but the agent itself knows when it took the
   * turn and when it gave it back.
   *
   *   started working -> the terminal, where the work is shown;
   *   answered        -> the composer, to write the next message;
   *   needs an answer -> the terminal, to give it.
   *
   * Only for the tab being looked at. A background tab says so in the sidebar
   * instead of taking the keyboard away from another one.
   */
  useEffect(() => {
    const unlisten = onAgentEvent((sessionId, state) => {
      const tabs = useTabsStore.getState();
      tabs.setAgentState(sessionId, state);
      if (sessionId !== activeSession()) return;
      suggestPane(state === "waiting" ? "composer" : "terminal");
    });
    return () => void unlisten.then((stop) => stop());
  }, [suggestPane]);

  /**
   * Who owns the keyboard, decided by what the shell reports about itself.
   *
   * Waiting for a command -> the composer, which is where commands are written.
   * Running one -> the terminal, whatever is running there: a full-screen
   * program, a prompt for confirmation, a password. Nothing is inferred from
   * the output, so no program can be a special case.
   *
   * Without the integration the shell says nothing and neither does this: the
   * keyboard stays where the user put it.
   */
  const [shellState, setShellState] = useState<ShellState>("unknown");
  const viewers = useTabsStore((state) => state.viewers);
  const showFile = useTabsStore((state) => state.showFile);
  const closeFile = useTabsStore((state) => state.closeFile);
  /** The files the active terminal has open, and which of them is on screen. */
  const viewing = activeId ? viewers[activeId] : undefined;
  const viewingFile = viewing?.active ?? null;

  useEffect(() => {
    const instance = getInstance(sessionId);
    setShellState(instance?.shellState ?? "unknown");
    return instance?.onShellStateChange((state) => {
      setShellState(state);
      // Back to the composer only if the composer is what sent the command.
      // A command typed in the terminal leaves the keyboard where it is.
      if (state === "prompt") {
        if (instance.fromComposer) suggestPane("composer");
      } else if (state === "running") {
        suggestPane("terminal");
      }
    });
  }, [sessionId, suggestPane]);

  const handleSubmit = useCallback(
    (message: Message) => {
      const instance = getInstance(activeSession());
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
    getInstance(activeSession())?.submit(getAdapter().abort());
  }, []);

  const handleInterrupt = useCallback(() => {
    getInstance(activeSession())?.submit(getAdapter().interrupt());
  }, []);

  const active = tabs.find((tab) => tab.id === activeId);
  const onTerminal = active?.kind === "terminal";
  const collapsed = pane === "terminal";
  const { height, animate, contentRef } = useComposerSlide(collapsed);

  return (
    <div className="app">
      <Sidebar />

      <div className="app__main">
        {/* The header is the title bar: it drags the window, and a double
            click on it maximises. */}
        <header className="app__header" data-tauri-drag-region>
          <span className="app__title">{active?.name ?? "Terminal Composer"}</span>
          {activePane && (
            <>
              <span className="app__crumb" aria-hidden="true">
                /
              </span>
              <span className="app__subtitle" title={activePane.cwd}>
                {activePane.cwd}
              </span>
            </>
          )}
          {/* Says why the keyboard is where it is, rather than leaving it to be
              worked out from the composer collapsing. */}
          {onTerminal && shellState !== "unknown" && (
            <span
              className={`app__badge app__badge--${shellState}`}
              title={activePane?.shell}
            >
              <span className="app__led" aria-hidden="true" />
              {t(shellState === "running" ? "app.shell.running" : "app.shell.prompt")}
            </span>
          )}

          <WindowControls />
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
              // The tab's shells side by side. Only the focused one blinks and
              // takes the keys; a click on any of them makes it the focused one.
              return (
                <div
                  key={tab.id}
                  className={`app__pane app__split${isActive ? "" : " app__pane--hidden"}`}
                >
                  {tab.panes.map((paneEntry) => {
                    const instance = getInstance(paneEntry.id);
                    return (
                      instance && (
                        <TerminalView
                          key={paneEntry.id}
                          instance={instance}
                          active={isActive}
                          focused={tab.panes.length > 1 && paneEntry.id === tab.paneId}
                        />
                      )
                    );
                  })}
                </div>
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
 * Brings Claude Code's settings in line with ours, and only when they differ --
 * it is another program's file, so it is not rewritten for nothing.
 */
async function syncAgentHooks(wanted: boolean): Promise<void> {
  const installed = await hooksInstalled();
  if (installed === wanted) return;
  await (wanted ? installHooks() : removeHooks()).catch(() => {
    // Claude Code may not be installed, or its settings may be unreadable.
    // Neither is a reason to get in the way.
  });
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

  if (workspace) setSharedHistory(historyOf(workspace));

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
 * The history saved last time.
 *
 * It used to be kept per tab; those lists are folded into the one shared list
 * rather than dropped, so nothing typed before this changed is lost.
 */
function historyOf(workspace: { history?: History; tabs: Array<{ composer?: unknown }> }): History {
  if (workspace.history) return workspace.history;

  const older = workspace.tabs
    .map((tab) => tab.composer as { history?: History } | undefined)
    .flatMap((composer) => composer?.history?.entries ?? []);
  return older.reduce(remember, EMPTY_HISTORY);
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
