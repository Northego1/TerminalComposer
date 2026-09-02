/**
 * Turning native clipboard / drag-drop payloads into `Attachment`s.
 *
 * The only thing the frontend cannot do for itself is find out *where* a
 * pasted file lives, so that part happens in Rust; everything after it is
 * plain data.
 */
import { invoke } from "@tauri-apps/api/core";

import type { Attachment } from "../../message/types";

interface IngestedFile {
  kind: "image" | "file";
  path: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

/** Whatever the system clipboard is currently offering as files or images. */
export async function attachmentsFromClipboard(): Promise<Attachment[]> {
  const files = await invoke<IngestedFile[]>("clipboard_read_attachments");
  return files.map(toAttachment);
}

/** Attachments for paths we already know -- used by drag & drop. */
export async function attachmentsFromPaths(paths: string[]): Promise<Attachment[]> {
  const files = await invoke<IngestedFile[]>("file_info", { paths });
  return files.map(toAttachment);
}

function toAttachment(file: IngestedFile): Attachment {
  const id = crypto.randomUUID();
  if (file.kind === "image") {
    return {
      type: "image",
      id,
      path: file.path,
      name: file.name,
      mimeType: file.mimeType ?? "image/png",
    };
  }
  return {
    type: "file",
    id,
    path: file.path,
    name: file.name,
    mimeType: file.mimeType ?? undefined,
    size: file.size ?? undefined,
  };
}
