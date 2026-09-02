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

/** Which of these words name a file that exists, relative to a session's cwd. */
export function resolvePaths(
  sessionId: string,
  tokens: string[],
): Promise<Array<string | null>> {
  return invoke<Array<string | null>>("resolve_paths", { id: sessionId, tokens });
}
