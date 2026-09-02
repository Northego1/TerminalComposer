import { useSessionsStore } from "../app/sessionsStore";

/** The list of open terminals, plus opening and closing them. */
export function Sidebar() {
  const sessions = useSessionsStore((state) => state.sessions);
  const activeId = useSessionsStore((state) => state.activeId);
  const activate = useSessionsStore((state) => state.activate);
  const open = useSessionsStore((state) => state.open);
  const close = useSessionsStore((state) => state.close);

  return (
    <aside className="sidebar">
      <div className="sidebar__list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`sidebar__item${
              session.id === activeId ? " sidebar__item--active" : ""
            }`}
          >
            <button
              type="button"
              className="sidebar__select"
              onClick={() => activate(session.id)}
              title={`${session.shell} · ${session.cwd}`}
            >
              {session.name}
            </button>
            <button
              type="button"
              className="sidebar__close"
              onClick={() => void close(session.id)}
              title="Закрыть терминал"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="sidebar__new" onClick={() => void open()}>
        + Новый терминал
      </button>
    </aside>
  );
}
