import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { CompletionState } from "./usePathCompletion";

interface CompletionListProps {
  state: CompletionState;
  onChoose: (index: number) => void;
}

/**
 * The list of paths, floating above the caret.
 *
 * Rendered into the body: the composer scrolls and is short, and a list drawn
 * inside it would be cut off immediately.
 */
export function CompletionList({ state, onChoose }: CompletionListProps) {
  const selectedRef = useRef<HTMLLIElement>(null);

  // Arrow keys move the selection past the visible edge, and only the list
  // itself can follow it there.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [state.selected]);

  if (!state.anchor || !state.items.length) return null;

  return createPortal(
    <ul
      className="completion"
      style={{ left: state.anchor.left, top: state.anchor.top }}
    >
      {state.items.map((item, index) => (
        <li key={item.path} ref={index === state.selected ? selectedRef : undefined}>
          <button
            type="button"
            className={`completion__item${
              index === state.selected ? " completion__item--selected" : ""
            }`}
            // The composer must not lose the caret to this click.
            onMouseDown={(event) => {
              event.preventDefault();
              onChoose(index);
            }}
          >
            <span className="completion__icon" aria-hidden="true">
              {item.isDir ? "▸" : "·"}
            </span>
            {item.name}
            {item.isDir && "/"}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}
