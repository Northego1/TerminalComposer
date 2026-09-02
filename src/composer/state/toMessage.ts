import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { Block, Message } from "../../message/types";

/**
 * Editor document -> `Message`.
 *
 * This is the composer's entire output contract. Text accumulates until an
 * attachment interrupts it, so a message keeps the order the user typed:
 * text, image, more text.
 */
export function toMessage(doc: ProseMirrorNode): Message {
  const blocks: Block[] = [];
  let text = "";

  const flushText = () => {
    if (text) blocks.push({ type: "text", text });
    text = "";
  };

  doc.forEach((block, _offset, index) => {
    if (index > 0) text += "\n";
    block.forEach((child) => {
      if (child.isText) {
        text += child.text ?? "";
      } else if (child.type.name === "attachment") {
        flushText();
        blocks.push(attachmentBlock(child.attrs));
      } else if (child.type.name === "hardBreak") {
        text += "\n";
      }
    });
  });

  flushText();
  return { blocks };
}

function attachmentBlock(attrs: Record<string, unknown>): Block {
  const path = String(attrs.path ?? "");
  const name = String(attrs.name ?? "");
  return attrs.kind === "image"
    ? { type: "image", path, name }
    : { type: "file", path, name };
}
