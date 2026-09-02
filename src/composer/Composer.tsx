import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { useFocusStore } from "../app/focusStore";
import { isEmptyMessage, type Message } from "../message/types";
import { composerExtensions, type ComposerHandlers } from "./editor/createEditor";
import { docToText, textToContent } from "./editor/documentText";
import { EMPTY_HISTORY, next, previous, remember } from "./state/history";
import { toMessage } from "./state/toMessage";

/** How long after a submission Esc still means "take it back". */
const UNDO_WINDOW_MS = 4000;

const PLACEHOLDER = "Напишите сообщение или команду...";

interface ComposerProps {
  onSubmit: (message: Message) => void;
  /** Asks the target to stop what the last submission started. */
  onAbort: () => void;
  disabled?: boolean;
}

/**
 * The composer: a small rich-text editor whose only output is a `Message`.
 *
 * It has no reference to the terminal, the PTY or any particular target --
 * see `src/message/adapters` for who turns a message into bytes.
 */
export function Composer({ onSubmit, onAbort, disabled = false }: ComposerProps) {
  const [undoable, setUndoable] = useState<string | null>(null);
  const pane = useFocusStore((state) => state.pane);
  const focusPane = useFocusStore((state) => state.focusPane);

  // Keyboard handlers run outside React's render, so everything they touch
  // lives in refs and stays current without rebuilding the editor.
  const history = useRef(EMPTY_HISTORY);
  const undoableRef = useRef<string | null>(null);
  const callbacks = useRef({ onSubmit, onAbort });
  useEffect(() => {
    callbacks.current = { onSubmit, onAbort };
  });

  const rememberUndoable = (text: string | null) => {
    undoableRef.current = text;
    setUndoable(text);
  };

  const handlers = useRef<ComposerHandlers>({
    submit: () => false,
    cancel: () => false,
    recallPrevious: () => false,
    recallNext: () => false,
  });

  const editor = useEditor({
    extensions: composerExtensions(() => handlers.current, PLACEHOLDER),
    editorProps: { attributes: { class: "composer__editor" } },
    onFocus: () => focusPane("composer"),
    onUpdate: () => rememberUndoable(null),
  });

  handlers.current = {
    submit: () => {
      if (!editor) return false;
      const message = toMessage(editor.state.doc);
      if (isEmptyMessage(message)) return true;

      const text = docToText(editor.state.doc);
      callbacks.current.onSubmit(message);
      history.current = remember(history.current, text);
      editor.commands.clearContent(true);
      rememberUndoable(text);
      return true;
    },

    // Esc right after a submission puts the text back and interrupts the
    // target; otherwise it just leaves the composer.
    cancel: () => {
      const restore = undoableRef.current;
      if (restore === null) {
        focusPane("terminal");
        return true;
      }
      callbacks.current.onAbort();
      editor?.commands.setContent(textToContent(restore));
      editor?.commands.focus("end");
      rememberUndoable(null);
      return true;
    },

    recallPrevious: () => {
      if (!editor) return false;
      const recalled = previous(history.current, docToText(editor.state.doc));
      if (!recalled) return false;
      history.current = recalled.history;
      replaceContent(recalled.text);
      return true;
    },

    recallNext: () => {
      if (!editor) return false;
      const recalled = next(history.current);
      if (!recalled) return false;
      history.current = recalled.history;
      replaceContent(recalled.text);
      return true;
    },
  };

  /** Recalled text lands with the caret at the end, ready to be edited. */
  function replaceContent(text: string) {
    editor?.commands.setContent(textToContent(text));
    editor?.commands.focus("end");
    rememberUndoable(null);
  }

  useEffect(() => {
    if (!editor) return;
    if (pane === "composer") editor.commands.focus();
    else editor.commands.blur();
  }, [pane, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (undoable === null) return;
    const timer = setTimeout(() => rememberUndoable(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoable]);

  const empty = !editor || editor.isEmpty;

  return (
    <div
      className={`composer${pane === "composer" ? " composer--active" : ""}`}
      onMouseDown={() => focusPane("composer")}
    >
      <EditorContent editor={editor} className="composer__surface" />
      <div className="composer__footer">
        <span
          className={`composer__hint${undoable !== null ? " composer__hint--undo" : ""}`}
        >
          {undoable !== null
            ? "Esc — отменить отправку и вернуть текст"
            : "Enter — отправить · Shift+Enter — новая строка · ↑↓ — история · Esc — свернуть"}
        </span>
        <button
          type="button"
          className="composer__send"
          onClick={() => handlers.current.submit()}
          disabled={disabled || empty}
        >
          Enter →
        </button>
      </div>
    </div>
  );
}
