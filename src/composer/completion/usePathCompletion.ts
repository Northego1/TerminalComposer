import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTabsStore } from "../../app/tabsStore";
import { invitesCompletion, tokenAtCaret, type Token } from "./token";

/** Long enough that typing does not fire a lookup per keystroke. */
const DEBOUNCE_MS = 120;

export interface PathCompletion {
  name: string;
  path: string;
  isDir: boolean;
}

export interface CompletionState {
  items: PathCompletion[];
  selected: number;
  /** Where to draw the list: the caret, in window coordinates. */
  anchor: { left: number; top: number } | null;
}

const CLOSED: CompletionState = { items: [], selected: 0, anchor: null };

/**
 * Completions for the path being typed in the composer.
 *
 * Offered by itself only for something already path-shaped -- a slash or a
 * tilde -- so writing prose to an agent is not interrupted by a directory
 * listing. Tab asks for them outright, the way a shell does, and then any word
 * counts.
 */
export function usePathCompletion(editor: Editor | null) {
  const [state, setState] = useState<CompletionState>(CLOSED);
  const token = useRef<Token | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useCallback(() => {
    token.current = null;
    setState(CLOSED);
  }, []);

  const lookUp = useCallback(
    (forced: boolean) => {
      if (!editor) return;
      const sessionId = useTabsStore.getState().activeId;
      const current = tokenAtCaret(editor.state);
      if (!sessionId || !current || (!forced && !invitesCompletion(current))) {
        return close();
      }

      token.current = current;
      void invoke<PathCompletion[]>("complete_path", {
        id: sessionId,
        token: current.text,
      })
        .then((items) => {
          // The caret may have moved on while this was in flight.
          if (token.current !== current) return;
          if (!items.length) return close();
          setState({ items, selected: 0, anchor: caretAnchor(editor) });
        })
        .catch(close);
    },
    [editor, close],
  );

  /** Called on every edit; the lookup itself waits for a pause. */
  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => lookUp(false), DEBOUNCE_MS);
  }, [lookUp]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const move = useCallback((by: number) => {
    setState((current) => {
      if (!current.items.length) return current;
      const selected =
        (current.selected + by + current.items.length) % current.items.length;
      return { ...current, selected };
    });
    return true;
  }, []);

  /** Puts the chosen path in place of the typed token. */
  const accept = useCallback(() => {
    const chosen = state.items[state.selected];
    const replacing = token.current;
    if (!editor || !chosen || !replacing) return false;

    // A directory is a step on the way, so it keeps its slash and the list
    // reopens for what is inside it.
    const insert = chosen.isDir ? `${chosen.name}/` : chosen.name;
    const from = replacing.from + replacing.text.lastIndexOf("/") + 1;

    editor.chain().focus().insertContentAt({ from, to: replacing.to }, insert).run();
    close();
    if (chosen.isDir) lookUp(true);
    return true;
  }, [editor, state, close, lookUp]);

  return { state, refresh, close, move, accept, request: () => lookUp(true) };
}

function caretAnchor(editor: Editor): { left: number; top: number } {
  const { left, top } = editor.view.coordsAtPos(editor.state.selection.from);
  return { left, top };
}
