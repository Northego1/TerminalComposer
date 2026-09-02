/**
 * Reading and writing the two persisted documents. Rust knows how to store a
 * named document; their shape lives here, in the frontend that owns it.
 */
import { invoke } from "@tauri-apps/api/core";

type DocumentKey = "settings" | "workspace";

export async function readDocument<T>(key: DocumentKey): Promise<T | null> {
  try {
    const contents = await invoke<string | null>("state_read", { key });
    return contents ? (JSON.parse(contents) as T) : null;
  } catch {
    // A missing or corrupt document must never keep the app from starting.
    return null;
  }
}

export async function writeDocument(key: DocumentKey, value: unknown): Promise<void> {
  try {
    await invoke("state_write", { key, value: JSON.stringify(value) });
  } catch {
    // Losing a save is survivable; refusing to run is not.
  }
}
