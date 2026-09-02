import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { AttachmentChip } from "../attachments/AttachmentChip";
import type { Attachment } from "../../message/types";

/**
 * An attachment inside the document: one inline, atomic node carrying the
 * fields the target eventually needs. Adding another attachment kind means
 * adding a `kind` value and a branch in the chip -- nothing else moves.
 */
export const AttachmentNode = Node.create({
  name: "attachment",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      kind: { default: "file" },
      path: { default: "" },
      name: { default: "" },
      mimeType: { default: null },
      size: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-attachment]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-attachment": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentChip);
  },
});

/** Editor content for an attachment. */
export function attachmentNodeFor(attachment: Attachment) {
  return {
    type: AttachmentNode.name,
    attrs: {
      kind: attachment.type,
      path: attachment.path,
      name: attachment.name,
      mimeType: attachment.mimeType ?? null,
      size: attachment.type === "file" ? (attachment.size ?? null) : null,
    },
  };
}
