import { convertFileSrc } from "@tauri-apps/api/core";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useT } from "../../i18n";

/** A file the clipboard had no name for: `paste-<uuid>.png`. */
const GENERATED_NAME = /^paste-[0-9a-f-]{36}\.[a-z0-9]+$/i;

/** How far the preview floats above the chip. */
const PREVIEW_GAP = 8;

/**
 * How an attachment looks inside the editor: an inline chip with a preview for
 * images and a name for everything else. It is a single atom as far as the
 * editor is concerned, so the caret steps over it and Backspace removes it
 * whole -- an attachment is a structured element, never text with markers.
 */
export function AttachmentChip({ node, editor, getPos, deleteNode, selected }: NodeViewProps) {
  const { kind, path, name, size } = node.attrs as {
    kind: "image" | "file";
    path: string;
    name: string;
    size: number | null;
  };
  const t = useT();
  const chipRef = useRef<HTMLSpanElement>(null);
  const [preview, setPreview] = useState<{ left: number; top: number } | null>(null);

  // Numbering is read from the document, so removing one renumbers the rest.
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    editor.on("update", rerender);
    return () => {
      editor.off("update", rerender);
    };
  }, [editor]);

  const label = GENERATED_NAME.test(name)
    ? t("attachment.image", { n: numberOf(editor, getPos) })
    : name;

  const showPreview = () => {
    const rect = chipRef.current?.getBoundingClientRect();
    if (rect) setPreview({ left: rect.left, top: rect.top - PREVIEW_GAP });
  };

  return (
    <NodeViewWrapper
      as="span"
      ref={chipRef}
      className={`attachment${selected ? " attachment--selected" : ""}`}
      data-drag-handle
      onMouseEnter={kind === "image" ? showPreview : undefined}
      onMouseLeave={() => setPreview(null)}
    >
      {kind === "image" ? (
        <img className="attachment__preview" src={convertFileSrc(path)} alt={label} />
      ) : (
        <span className="attachment__icon" aria-hidden="true">
          ▤
        </span>
      )}
      <span className="attachment__name" title={path}>
        {label}
      </span>
      {size ? <span className="attachment__size">{formatSize(size)}</span> : null}
      <button
        type="button"
        className="attachment__remove"
        onClick={deleteNode}
        title={t("attachment.remove")}
        tabIndex={-1}
      >
        ×
      </button>

      {/*
        Rendered into the body rather than next to the chip: the editor scrolls,
        and anything larger than a line would be cut off by it.
      */}
      {preview &&
        createPortal(
          <img
            className="attachment-preview"
            style={{ left: preview.left, top: preview.top }}
            src={convertFileSrc(path)}
            alt={label}
          />,
          document.body,
        )}
    </NodeViewWrapper>
  );
}

/** Which pasted image this is, counting from the start of the document. */
function numberOf(editor: NodeViewProps["editor"], getPos: NodeViewProps["getPos"]): number {
  const position = getPos();
  if (typeof position !== "number") return 1;

  let count = 0;
  editor.state.doc.descendants((node, nodePosition) => {
    if (
      nodePosition < position &&
      node.type.name === "attachment" &&
      GENERATED_NAME.test(String(node.attrs.name))
    ) {
      count += 1;
    }
    return true;
  });
  return count + 1;
}

function formatSize(bytes: number): string {
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
