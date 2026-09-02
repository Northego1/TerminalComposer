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
  const [results, setResults] = useState({ index: -1, count: 0 });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // The addon reports the match count and which one is active as it searches.
  useEffect(() => {
    setResults({ index: -1, count: 0 });
    return getInstance(activeId)?.onSearchResults(setResults);
  }, [activeId]);

  // Leaving search behind should not leave its highlights behind too.
  useEffect(() => () => getInstance(activeId)?.clearSearch(), [activeId]);

  const find = (direction: "next" | "previous", value = term) => {
    const instance = getInstance(activeId);
    if (!instance) return;
    if (!value) {
      instance.clearSearch();
      setResults({ index: -1, count: 0 });
      return;
    }
    if (direction === "next") instance.findNext(value);
    else instance.findPrevious(value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "Enter":
      case "ArrowDown":
        event.preventDefault();
        find(event.shiftKey && event.key === "Enter" ? "previous" : "next");
        break;
      case "ArrowUp":
        event.preventDefault();
        find("previous");
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
    }
  };

  const nothingFound = term !== "" && results.count === 0;

  return (
    <div className="terminal-search">
      <input
        ref={inputRef}
        className={`terminal-search__input${
          nothingFound ? " terminal-search__input--missing" : ""
        }`}
        value={term}
        placeholder="Поиск по терминалу"
        spellCheck={false}
        onChange={(event) => {
          setTerm(event.target.value);
          find("next", event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <span className="terminal-search__count">
        {term === ""
          ? ""
          : `${results.index >= 0 ? results.index + 1 : 0}/${results.count}`}
      </span>
      <button type="button" onClick={() => find("previous")} title="Предыдущее (↑)">
        ↑
      </button>
      <button type="button" onClick={() => find("next")} title="Следующее (↓)">
        ↓
      </button>
      <button type="button" onClick={onClose} title="Закрыть (Esc)">
        ×
      </button>
    </div>
  );
}
