import { useEffect, useRef, useState } from "react";

import { getInstance, useSessionsStore } from "../app/sessionsStore";

interface TerminalSearchProps {
  onClose: () => void;
}

/** Search over the active terminal's scrollback, driven by xterm's search addon. */
export function TerminalSearch({ onClose }: TerminalSearchProps) {
  const activeId = useSessionsStore((state) => state.activeId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Leaving search behind should not leave its highlights behind too.
  useEffect(() => () => getInstance(activeId)?.clearSearch(), [activeId]);

  const find = (direction: "next" | "previous", value = term) => {
    const instance = getInstance(activeId);
    if (!instance || !value) return;
    const found =
      direction === "next"
        ? instance.findNext(value)
        : instance.findPrevious(value);
    setMissing(!found);
  };

  return (
    <div className="terminal-search">
      <input
        ref={inputRef}
        className={`terminal-search__input${missing ? " terminal-search__input--missing" : ""}`}
        value={term}
        placeholder="Поиск по терминалу"
        spellCheck={false}
        onChange={(event) => {
          setTerm(event.target.value);
          setMissing(false);
          find("next", event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            find(event.shiftKey ? "previous" : "next");
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <button type="button" onClick={() => find("previous")} title="Предыдущее (Shift+Enter)">
        ↑
      </button>
      <button type="button" onClick={() => find("next")} title="Следующее (Enter)">
        ↓
      </button>
      <button type="button" onClick={onClose} title="Закрыть (Esc)">
        ×
      </button>
    </div>
  );
}
