import { useEffect, useRef, useState } from "react";

import { useFocusStore } from "../app/focusStore";
import { isEmptyMessage, type Message } from "../message/types";
import { EMPTY_HISTORY, next, previous, remember } from "./state/history";

/** How long after a submission Esc still means "take it back". */
const UNDO_WINDOW_MS = 4000;

interface ComposerProps {
  onSubmit: (message: Message) => void;
  /** Asks the target to stop what the last submission started. */
  onAbort: () => void;
  disabled?: boolean;
}

/**
 * Slice 1 composer: a plain textarea, replaced by a Tiptap editor in Slice 2.
 *
 * Already final here: the composer's only output is a `Message`. It has no
 * reference to the terminal, the PTY or any particular target.
 */
export function Composer({ onSubmit, onAbort, disabled = false }: ComposerProps) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [undoable, setUndoable] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pane = useFocusStore((state) => state.pane);
  const focusPane = useFocusStore((state) => state.focusPane);

  useEffect(() => {
    if (pane === "composer") textareaRef.current?.focus();
    else textareaRef.current?.blur();
  }, [pane]);

  useEffect(() => {
    if (undoable === null) return;
    const timer = setTimeout(() => setUndoable(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoable]);

  /** Recalled text lands with the caret at the end, ready to be edited. */
  const replaceValue = (text: string) => {
    setValue(text);
    setUndoable(null);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.setSelectionRange(text.length, text.length);
    });
  };

  const submit = () => {
    const message: Message = { blocks: [{ type: "text", text: value }] };
    if (isEmptyMessage(message)) return;
    onSubmit(message);
    setHistory(remember(history, value));
    setUndoable(value);
    setValue("");
  };

  /** Esc right after a submission puts the text back and interrupts the target. */
  const undoSubmit = () => {
    if (undoable === null) return false;
    onAbort();
    setValue(undoable);
    setUndoable(null);
    return true;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (!undoSubmit()) focusPane("terminal");
      return;
    }

    // History recall only takes over when the caret cannot move any further in
    // that direction, so arrows keep navigating multi-line text normally.
    if (event.key === "ArrowUp" && onFirstLine(textarea)) {
      const recalled = previous(history, value);
      if (!recalled) return;
      event.preventDefault();
      setHistory(recalled.history);
      replaceValue(recalled.text);
      return;
    }

    if (event.key === "ArrowDown" && onLastLine(textarea)) {
      const recalled = next(history);
      if (!recalled) return;
      event.preventDefault();
      setHistory(recalled.history);
      replaceValue(recalled.text);
    }
  };

  return (
    <div
      className={`composer${pane === "composer" ? " composer--active" : ""}`}
      onMouseDown={() => focusPane("composer")}
    >
      <textarea
        ref={textareaRef}
        className="composer__input"
        value={value}
        placeholder="Напишите сообщение или команду..."
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
          setUndoable(null);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => focusPane("composer")}
      />
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
          onClick={submit}
          disabled={disabled || value.trim() === ""}
        >
          Enter →
        </button>
      </div>
    </div>
  );
}

function onFirstLine(textarea: HTMLTextAreaElement): boolean {
  return !textarea.value.slice(0, textarea.selectionStart).includes("\n");
}

function onLastLine(textarea: HTMLTextAreaElement): boolean {
  return !textarea.value.slice(textarea.selectionEnd).includes("\n");
}
