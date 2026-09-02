import type { Adapter } from "./Adapter";
import { shellAdapter } from "./shellAdapter";

/**
 * Adding support for another target (Codex, Aider, ...) means adding an adapter
 * here. The composer does not change.
 */
const adapters = {
  shell: shellAdapter,
} satisfies Record<string, Adapter>;

export type AdapterId = keyof typeof adapters;

export const DEFAULT_ADAPTER: AdapterId = "shell";

export function getAdapter(id: AdapterId = DEFAULT_ADAPTER): Adapter {
  return adapters[id];
}
