import { Extension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";

import { onFirstLine, onLastLine } from "./documentText";

/**
 * What the keymap needs from the composer. Handlers return true when they
 * consumed the key, following the ProseMirror convention.
 */
export interface ComposerHandlers {
  submit(): boolean;
  /** Esc: take back the last submission, or leave the composer. */
  cancel(): boolean;
  recallPrevious(): boolean;
  recallNext(): boolean;
  /** Ctrl+C on an empty selection: drop the draft and interrupt the target. */
  interrupt(): boolean;
}

/**
 * The composer's own keys. Everything else -- selection, undo/redo, caret
 * movement -- is left to ProseMirror, which already does it properly.
 */
const ComposerKeymap = Extension.create<{ handlers: () => ComposerHandlers }>({
  name: "composerKeymap",

  addOptions() {
    return {
      handlers: () => {
        throw new Error("composer keymap used without handlers");
      },
    };
  },

  addKeyboardShortcuts() {
    const handlers = () => this.options.handlers();
    return {
      Enter: () => handlers().submit(),
      "Shift-Enter": ({ editor }) => editor.commands.splitBlock(),
      Escape: () => handlers().cancel(),
      // With a selection Ctrl+C must still copy, so the key is only taken over
      // when there is nothing to copy -- which is how a terminal behaves too.
      "Mod-c": ({ editor }) =>
        editor.state.selection.empty ? handlers().interrupt() : false,
      ArrowUp: ({ editor }) =>
        onFirstLine(editor.state) ? handlers().recallPrevious() : false,
      ArrowDown: ({ editor }) =>
        onLastLine(editor.state) ? handlers().recallNext() : false,
    };
  },
});

/**
 * A deliberately small editor: paragraphs, text, undo/redo, placeholder.
 *
 * This is an input field, not a document editor -- no headings, lists, marks or
 * code blocks. Slice 4 adds one more node type here, for attachments.
 */
export function composerExtensions(
  handlers: () => ComposerHandlers,
  placeholder: string,
) {
  return [
    Document,
    Paragraph,
    Text,
    UndoRedo,
    Placeholder.configure({ placeholder }),
    ComposerKeymap.configure({ handlers }),
  ];
}
