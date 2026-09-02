/**
 * The only place in the frontend that talks to the Rust PTY layer.
 * Everything above this file deals in plain data, not Tauri IPC.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface PtySessionInfo {
  id: string;
  shell: string;
  cwd: string;
}

export interface SpawnOptions {
  cwd?: string;
  shell?: string;
  cols: number;
  rows: number;
}

export function spawn(options: SpawnOptions): Promise<PtySessionInfo> {
  return invoke<PtySessionInfo>("pty_spawn", { options });
}

export function write(id: string, data: string): Promise<void> {
  return invoke<void>("pty_write", { id, data });
}

export function resize(id: string, cols: number, rows: number): Promise<void> {
  return invoke<void>("pty_resize", { id, cols, rows });
}

export function close(id: string): Promise<void> {
  return invoke<void>("pty_close", { id });
}

export function onOutput(
  id: string,
  handler: (data: string) => void,
): Promise<UnlistenFn> {
  return listen<{ data: string }>(`pty://output/${id}`, (event) =>
    handler(event.payload.data),
  );
}

export function onExit(
  id: string,
  handler: (code: number | null) => void,
): Promise<UnlistenFn> {
  return listen<{ code: number | null }>(`pty://exit/${id}`, (event) =>
    handler(event.payload.code),
  );
}
