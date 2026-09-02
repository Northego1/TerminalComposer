import { useCallback, useEffect, useRef, useState } from "react";

import { useFocusStore } from "./app/focusStore";
import { forEachInstance, getInstance, useSessionsStore } from "./app/sessionsStore";
import { applySettingsToDocument, useSettingsStore } from "./app/settingsStore";
import { readWorkspace, scheduleWorkspaceSave } from "./app/workspace";
import { useGlobalHotkeys } from "./app/useGlobalHotkeys";
import { Composer } from "./composer/Composer";
import { getAdapter } from "./message/adapters/registry";
import { isEmptyMessage, type Message } from "./message/types";
import { saveComposerState } from "./composer/state/drafts";
import { SettingsDialog } from "./settings/SettingsDialog";
import { Sidebar } from "./sidebar/Sidebar";
import { TerminalSearch } from "./terminal/TerminalSearch";
import { TerminalView } from "./terminal/TerminalView";

/** How much of the composer stays visible while the terminal is active. */
const PEEK_HEIGHT = 44;
const SLIDE_MS = 160;

/**
 * Layout: terminals on the left, the active one on the right with the composer
 * under it.
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
 * and neither knows about the other. One composer serves every session and
 * always talks to the active one.
 */
export default function App() {
  const sessions = useSessionsStore((state) => state.sessions);
  const activeId = useSessionsStore((state) => state.activeId);
  const error = useSessionsStore((state) => state.error);
  const settings = useSettingsStore((state) => state.settings);
  const pane = useFocusStore((state) => state.pane);
  const focusPane = useFocusStore((state) => state.focusPane);
  const [searching, setSearching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useGlobalHotkeys({ openSearch: () => setSearching(true) });

  // A ref survives StrictMode's double mount, so startup happens once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, []);

  // Settings apply to the interface and to every terminal already running.
  useEffect(() => {
    applySettingsToDocument(settings);
    forEachInstance((instance) => instance.applySettings(settings));
  }, [settings]);

  // Anything that changes the terminal list is worth remembering for next time.
  useEffect(() => useSessionsStore.subscribe(scheduleWorkspaceSave), []);

  useEffect(() => {
    const instance = getInstance(activeId);
    if (!instance) return;
    if (pane === "terminal") instance.focus();
    else instance.blur();
  }, [pane, activeId]);

  const handleSubmit = useCallback(
    (message: Message) => {
      const instance = getInstance(useSessionsStore.getState().activeId);
      if (!instance || isEmptyMessage(message)) return;
      void instance.submit(getAdapter().serialize(message, instance.capabilities));
    },
    [],
  );

  const handleAbort = useCallback(() => {
    getInstance(useSessionsStore.getState().activeId)?.submit(getAdapter().abort());
  }, []);

  const handleInterrupt = useCallback(() => {
    getInstance(useSessionsStore.getState().activeId)?.submit(
      getAdapter().interrupt(),
    );
  }, []);

  const active = sessions.find((session) => session.id === activeId);
  const collapsed = pane === "terminal";
  const { height, animate, contentRef } = useComposerSlide(collapsed);

  return (
    <div className="app">
      <Sidebar onOpenSettings={() => setShowSettings(true)} />

      <div className="app__main">
        <header className="app__header">
          <span className="app__title">{active?.name ?? "Terminal Composer"}</span>
          <span className="app__subtitle">
            {active ? `${active.shell} · ${active.cwd}` : "…"}
          </span>
        </header>

        <main className="app__body">
          {searching && (
            <TerminalSearch
              onClose={() => {
                setSearching(false);
                focusPane("terminal");
              }}
            />
          )}
          {error && <div className="app__error">Не удалось запустить shell: {error}</div>}
          {sessions.map((session) => {
            const instance = getInstance(session.id);
            return (
              instance && (
                <TerminalView
                  key={session.id}
                  instance={instance}
                  active={session.id === activeId}
                />
              )
            );
          })}
        </main>

        <footer
          className={[
            "app__composer",
            collapsed ? "app__composer--peek" : "",
            animate ? "app__composer--animate" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ height: collapsed ? PEEK_HEIGHT : height }}
          title={collapsed ? "Открыть composer" : undefined}
          onMouseDown={collapsed ? () => focusPane("composer") : undefined}
        >
          <div className="app__composer-inner" ref={contentRef}>
            <Composer
              onSubmit={handleSubmit}
              onAbort={handleAbort}
              onInterrupt={handleInterrupt}
              disabled={!activeId}
            />
          </div>
        </footer>
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

/**
 * Startup: settings first, because terminals are created with them, then the
 * terminals that were open last time -- or a fresh one on a first run.
 */
async function start(): Promise<void> {
  await useSettingsStore.getState().load();
  applySettingsToDocument(useSettingsStore.getState().settings);

  const workspace = await readWorkspace();
  const sessions = useSessionsStore.getState();

  if (workspace?.sessions.length) {
    await sessions.restore(
      workspace.sessions.map(({ name, cwd }) => ({ name, cwd })),
      workspace.activeIndex,
      (id, index) => saveComposerState(id, workspace.sessions[index].composer),
    );
    return;
  }

  await sessions.open();
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
