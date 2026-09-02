import { convertFileSrc } from "@tauri-apps/api/core";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { useT } from "../../i18n";

/**
 * How an attachment looks inside the editor: an inline chip with a preview for
 * images and a name for everything else. It is a single atom as far as the
 * editor is concerned, so the caret steps over it and Backspace removes it
 * whole -- an attachment is a structured element, never text with markers.
 */
export function AttachmentChip({ node, deleteNode, selected }: NodeViewProps) {
  const t = useT();
  const { kind, path, name, size } = node.attrs as {
    kind: "image" | "file";
    path: string;
    name: string;
    size: number | null;
  };

  return (
    <NodeViewWrapper
      as="span"
      className={`attachment${selected ? " attachment--selected" : ""}`}
      data-drag-handle
    >
      {kind === "image" ? (
        <img className="attachment__preview" src={convertFileSrc(path)} alt={name} />
      ) : (
        <span className="attachment__icon" aria-hidden="true">
          ▤
        </span>
      )}
      <span className="attachment__name" title={path}>
        {name}
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
    </NodeViewWrapper>
  );
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
