import { invoke } from "@tauri-apps/api/core";

export interface FileContents {
  path: string;
  name: string;
  kind: "text" | "image" | "binary";
  text: string | null;
  size: number;
  truncated: boolean;
}

export function readFile(path: string): Promise<FileContents> {
  return invoke<FileContents>("read_file", { path });
}

/** Hands a link to the desktop; the window never navigates. */
export function openExternal(url: string): Promise<void> {
  return invoke("open_external", { url });
}

/** Which of these words name a file that exists, relative to a session's cwd. */
export function resolvePaths(
  sessionId: string,
  tokens: string[],
): Promise<Array<string | null>> {
  return invoke<Array<string | null>>("resolve_paths", { id: sessionId, tokens });
}
