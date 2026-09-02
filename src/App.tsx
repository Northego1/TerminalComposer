import { useCallback, useEffect, useRef, useState } from "react";

import { hooksInstalled, installHooks, onAgentEvent, removeHooks } from "./agent/events";
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

  // The agent's hooks follow the setting, in both directions.
  useEffect(() => {
    void syncAgentHooks(settings.agentHooks);
  }, [settings.agentHooks]);

  // Anything that changes the tabs is worth remembering for next time.
  useEffect(() => useTabsStore.subscribe(scheduleWorkspaceSave), []);

  /**
   * What the agent in each terminal reports about itself.
   *
   * An agent that needs an answer says so through its own hooks, which is the
   * only honest way to know: in the active tab the keyboard goes to it, and in
   * a background tab the sidebar says which one is waiting.
   */
  useEffect(() => {
    const unlisten = onAgentEvent((sessionId, state) => {
      useTabsStore.getState().setAgentState(sessionId, state);
      if (state === "attention" && sessionId === useTabsStore.getState().activeId) {
        focusPane("terminal");
      }
    });
    return () => void unlisten.then((stop) => stop());
  }, [focusPane]);

  useEffect(() => {
    const instance = getInstance(activeId);
    if (!instance) return;
    if (pane === "terminal") instance.focus();
    else instance.blur();
  }, [pane, activeId]);

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

  useEffect(() => {
    const instance = getInstance(activeId);
    setShellState(instance?.shellState ?? "unknown");
    return instance?.onShellStateChange((state) => {
      setShellState(state);
      if (state === "prompt") focusPane("composer");
      else if (state === "running") focusPane("terminal");
    });
  }, [activeId, focusPane]);

  const handleSubmit = useCallback(
    (message: Message) => {
      const instance = getInstance(useTabsStore.getState().activeId);
      if (!instance || isEmptyMessage(message)) return;
      void instance.submit(getAdapter().serialize(message, instance.capabilities));
    },
    [],
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
        </main>

        {collapsed && onTerminal && (
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
            onTerminal ? "" : "app__composer--hidden",
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
