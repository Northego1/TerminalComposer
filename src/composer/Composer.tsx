import { useEffect, useRef, useState } from "react";

import { useFocusStore } from "../app/focusStore";
import { isEmptyMessage, type Message } from "../message/types";

interface ComposerProps {
  onSubmit: (message: Message) => void;
  disabled?: boolean;
}

/**
 * Slice 1 composer: a plain textarea, replaced by a Tiptap editor in Slice 2.
 *
 * Already final here: the composer's only output is a `Message`. It has no
 * reference to the terminal, the PTY or any particular target.
 */
export function Composer({ onSubmit, disabled = false }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pane = useFocusStore((state) => state.pane);
  const focusPane = useFocusStore((state) => state.focusPane);

  useEffect(() => {
    if (pane === "composer") textareaRef.current?.focus();
    else textareaRef.current?.blur();
  }, [pane]);

  const submit = () => {
    const message: Message = { blocks: [{ type: "text", text: value }] };
    if (isEmptyMessage(message)) return;
    onSubmit(message);
    setValue("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      focusPane("terminal");
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
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => focusPane("composer")}
      />
      <div className="composer__footer">
        <span className="composer__hint">
          Enter — отправить · Shift+Enter — новая строка · Esc — в терминал
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
