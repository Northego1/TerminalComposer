import type { EditorState } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * Plain-text view of the editor document.
 *
 * The composer is a rich editor over what is ultimately line-based input, so
 * these helpers are the single place where "document" and "text" are mapped
 * onto each other. Everything here is pure and independent of React.
 */

/** Blocks and hard breaks both read back as newlines. */
export function docToText(doc: ProseMirrorNode): string {
  return doc.textBetween(0, doc.content.size, "\n", "\n");
}

/**
 * Whether the document has outgrown a single command line.
 *
 * This is what decides between the composer's two shapes, and it is derived
 * from the content rather than stored: more than one line, or an attachment,
 * means a message rather than a command -- and deleting back to one line brings
 * the compact shape back on its own.
 */
export function needsFullComposer(doc: ProseMirrorNode): boolean {
  if (doc.childCount > 1) return true;
  let hasAttachment = false;
  doc.descendants((node) => {
    if (node.type.name === "attachment") hasAttachment = true;
    return !hasAttachment;
  });
  return hasAttachment;
}

/**
 * Whether the caret sits on the first / last line of the document.
 *
 * History recall hooks onto the arrow keys only at these edges, so arrows keep
 * moving the caret through multi-line text as usual.
 */
export function onFirstLine(state: EditorState): boolean {
  const { from, empty } = state.selection;
  if (!empty) return false;
  return !state.doc.textBetween(0, from, "\n", "\n").includes("\n");
}

export function onLastLine(state: EditorState): boolean {
  const { to, empty } = state.selection;
  if (!empty) return false;
  return !state.doc
    .textBetween(to, state.doc.content.size, "\n", "\n")
    .includes("\n");
}
