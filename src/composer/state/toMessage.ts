import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { Message } from "../../message/types";
import { docToText } from "../editor/documentText";

/**
 * Editor document -> `Message`.
 *
 * This is the composer's entire output contract. Today the document holds only
 * text, so a message is one text block; when attachment nodes arrive in Slice 4
 * this walker starts emitting image/file blocks between the text ones.
 */
export function toMessage(doc: ProseMirrorNode): Message {
  return { blocks: [{ type: "text", text: docToText(doc) }] };
}
