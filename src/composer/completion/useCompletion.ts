import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTabsStore } from "../../app/tabsStore";
import { loadSpec } from "./specs";
import { tokenAtCaret, type Token } from "./token";
import { suggestFromSpec } from "./walkSpec";

/** Long enough that typing does not fire a lookup per keystroke. */
const DEBOUNCE_MS = 120;

export interface Suggestion {
  /** What to show. */
  label: string;
  /** What replaces the typed token, or the part of it after the last slash. */
  insert: string;
  description?: string;
  kind: "command" | "subcommand" | "option" | "dir" | "file";
}

export interface CompletionState {
  items: Suggestion[];
  selected: number;
  /** Where to draw the list: the caret, in window coordinates. */
  anchor: { left: number; top: number } | null;
}

interface PathCompletion {
  name: string;
  path: string;
  isDir: boolean;
}

const CLOSED: CompletionState = { items: [], selected: 0, anchor: null };

/** Path-shaped enough to complete as a path rather than as a command. */
const LOOKS_LIKE_PATH = /[/~]/;

/**
 * Completions for what is being typed in the composer.
 *
 * Two sources, chosen by where the caret is: the first word of a line is a
 * command, and the shell itself says which ones there are -- including its
 * aliases and functions, which nothing assembled elsewhere would know. Anything
 * else is a path, resolved against that shell's working directory.
 *
 * Offered on its own while the composer is a command line, or for something
 * already path-shaped. In a message it waits to be asked: a directory listing
 * has no business interrupting prose. Tab always asks.
 */
export function useCompletion(editor: Editor | null, commandLine: boolean) {
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
      if (!sessionId || !current) return close();

      const pathShaped = LOOKS_LIKE_PATH.test(current.text);
      const welcome = forced || pathShaped || (current.first && commandLine) ||
        (!current.first && commandLine);
      if (!welcome) return close();

      token.current = current;

      void suggestionsFor(sessionId, current, pathShaped)
        .then((items) => {
          // The caret may have moved on while this was in flight.
          if (token.current !== current) return;
          if (!items.length) return close();
          setState({ items, selected: 0, anchor: caretAnchor(editor) });
        })
        .catch(close);
    },
    [editor, close, commandLine],
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

  /** Puts the chosen name in place of what was typed. */
  const accept = useCallback(() => {
    const chosen = state.items[state.selected];
    const replacing = token.current;
    if (!editor || !chosen || !replacing) return false;

    // Only the part after the last slash is being completed; the directories
    // already typed stay as they are.
    const from = replacing.from + replacing.text.lastIndexOf("/") + 1;

    editor
      .chain()
      .focus()
      .insertContentAt({ from, to: replacing.to }, chosen.insert)
      .run();
    close();

    // A directory is a step on the way, so the list reopens for what is inside.
    if (chosen.kind === "dir") lookUp(true);
    return true;
  }, [editor, state, close, lookUp]);

  return { state, refresh, close, move, accept, request: () => lookUp(true) };
}

/**
 * Where the suggestions come from, decided by where the caret is.
 *
 * The first word is a command; after it, what the command itself accepts --
 * its subcommands and its flags, from the description shipped with us. Only
 * when that has nothing to say does it fall back to the filesystem, because
 * most arguments are paths.
 */
async function suggestionsFor(
  sessionId: string,
  token: Token,
  pathShaped: boolean,
): Promise<Suggestion[]> {
  if (token.first && !pathShaped) {
    const names = await invoke<string[]>("complete_command", {
      id: sessionId,
      prefix: token.text,
    });
    return names.map((name) => ({ label: name, insert: name, kind: "command" }));
  }

  if (!pathShaped) {
    const words = token.line.trim().split(/\s+/);
    const spec = await loadSpec(words[0]);
    if (spec) {
      const fromSpec = suggestFromSpec(spec, words.slice(1, -1), token.text);
      if (fromSpec.length) {
        return fromSpec.map((item) => ({
          label: item.label,
          insert: item.label,
          description: item.description,
          kind: item.kind,
        }));
      }
    }
  }

  const paths = await invoke<PathCompletion[]>("complete_path", {
    id: sessionId,
    token: token.text,
  });
  return paths.map((item) => ({
    label: item.isDir ? `${item.name}/` : item.name,
    insert: item.isDir ? `${item.name}/` : item.name,
    kind: item.isDir ? "dir" : "file",
  }));
}

function caretAnchor(editor: Editor): { left: number; top: number } {
  const { left, top } = editor.view.coordsAtPos(editor.state.selection.from);
  return { left, top };
}
