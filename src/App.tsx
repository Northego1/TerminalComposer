import { useCallback, useEffect, useRef, useState } from "react";

import { useFocusStore } from "./app/focusStore";
import { forEachInstance, getInstance, useTabsStore } from "./app/tabsStore";
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

/** How much of the composer stays visible while the terminal is active. */
const PEEK_HEIGHT = 44;
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

  // Anything that changes the tabs is worth remembering for next time.
  useEffect(() => useTabsStore.subscribe(scheduleWorkspaceSave), []);

  useEffect(() => {
    const instance = getInstance(activeId);
    if (!instance) return;
    if (pane === "terminal") instance.focus();
    else instance.blur();
  }, [pane, activeId]);

  const handleSubmit = useCallback((message: Message) => {
    const instance = getInstance(useTabsStore.getState().activeId);
    if (!instance || isEmptyMessage(message)) return;
    void instance.submit(getAdapter().serialize(message, instance.capabilities));
  }, []);

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
          {collapsed && (
            <button
              type="button"
              className="composer-peek"
              onClick={() => focusPane("composer")}
              title={t("composer.expand")}
              aria-label={t("composer.expand")}
            >
              ↑
            </button>
          )}
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
