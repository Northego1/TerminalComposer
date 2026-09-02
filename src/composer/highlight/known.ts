import { invoke } from "@tauri-apps/api/core";

/**
 * What exists, as far as colouring is concerned.
 *
 * Both answers come from the same places completion uses -- the shell's own
 * list of commands and the filesystem -- and both are remembered, because the
 * question is asked again on every keystroke while the answer rarely changes.
 *
 * Nothing here waits. A word not yet looked up is simply not coloured, and the
 * colour appears when the answer does.
 */
const commands = new Map<string, Set<string>>();
const paths = new Map<string, boolean>();
const pending = new Set<string>();

/** Called when something previously unknown has been resolved. */
let notify: () => void = () => {};

export function onResolved(handler: () => void): void {
  notify = handler;
}

export function knowsCommand(sessionId: string, name: string): boolean | null {
  const known = commands.get(sessionId);
  if (!known) {
    void loadCommands(sessionId);
    return null;
  }
  return known.has(name);
}

export function knowsPath(sessionId: string, token: string): boolean | null {
  const key = `${sessionId} ${token}`;
  const known = paths.get(key);
  if (known !== undefined) return known;
  if (pending.has(key)) return null;

  pending.add(key);
  void invoke<Array<string | null>>("resolve_paths", { id: sessionId, tokens: [token] })
    .then(([resolved]) => {
      paths.set(key, Boolean(resolved));
      pending.delete(key);
      notify();
    })
    .catch(() => pending.delete(key));
  return null;
}

async function loadCommands(sessionId: string): Promise<void> {
  if (pending.has(sessionId)) return;
  pending.add(sessionId);
  try {
    const names = await invoke<string[]>("shell_commands", { id: sessionId });
    if (names.length) commands.set(sessionId, new Set(names));
  } finally {
    pending.delete(sessionId);
    notify();
  }
}

/** A session is gone, and so is everything remembered about it. */
export function forgetSession(sessionId: string): void {
  commands.delete(sessionId);
  for (const key of paths.keys()) {
    if (key.startsWith(`${sessionId} `)) paths.delete(key);
  }
}
