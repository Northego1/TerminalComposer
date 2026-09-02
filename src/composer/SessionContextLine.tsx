import { useEffect, useState } from "react";

import { getInstance } from "../app/tabsStore";
import * as pty from "../terminal/ptyClient";

/**
 * How often the shell's directory and branch are re-read.
 *
 * Both change as a side effect of commands the user runs, and there is no event
 * to hang this on -- polling two small files is cheaper than any machinery that
 * would tell us precisely.
 */
const REFRESH_MS = 2000;

/** The directory and branch of a session, kept current. */
export function useSessionContext(sessionId: string | null): pty.SessionContext | null {
  const [context, setContext] = useState<pty.SessionContext | null>(null);

  useEffect(() => {
    setContext(null);
    if (!sessionId || !getInstance(sessionId)) return;

    let cancelled = false;
    const refresh = () =>
      pty
        .context(sessionId)
        .then((next) => {
          if (!cancelled) setContext(next);
        })
        .catch(() => {
          // The session is gone; its tab is on its way out too.
        });

    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  return context;
}

interface SessionContextLineProps {
  context: pty.SessionContext | null;
}

/** The directory and branch, shown next to the prompt. */
export function SessionContextLine({ context }: SessionContextLineProps) {
  if (!context) return null;
  return (
    <span className="composer__context">
      <span className="composer__cwd">{shorten(context.cwd)}</span>
      {context.branch && <span className="composer__branch">{context.branch}</span>}
    </span>
  );
}

/** `/home/you/work/project` reads as `~/work/project`. */
function shorten(path: string): string {
  const home = path.match(/^\/home\/[^/]+/)?.[0];
  return home ? path.replace(home, "~") : path;
}
