import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";

import { AttachmentNode } from "./AttachmentNode";
import { Highlight } from "../highlight/Highlight";
import { Autosuggest } from "./Autosuggest";

import { onFirstLine, onLastLine, wordEraseLength } from "./documentText";

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
  /**
   * The completion list, while it is open, owns the keys that drive it.
   * Each returns true only when it actually took the key.
   */
  completionMove(by: number): boolean;
  completionAccept(): boolean;
  completionClose(): boolean;
  completionRequest(): boolean;
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
      Enter: () => handlers().completionAccept() || handlers().submit(),
      "Shift-Enter": ({ editor }) => editor.commands.splitBlock(),
      Escape: () => handlers().completionClose() || handlers().cancel(),
      Tab: () => handlers().completionAccept() || handlers().completionRequest(),
      ArrowUp: ({ editor }) =>
        handlers().completionMove(-1) ||
        (onFirstLine(editor.state) ? handlers().recallPrevious() : false),
      ArrowDown: ({ editor }) =>
        handlers().completionMove(1) ||
        (onLastLine(editor.state) ? handlers().recallNext() : false),
    };
  },

  /**
   * Ctrl shortcuts, resolved by physical key.
   *
   * ProseMirror matches `Mod-c` against `event.key`, which is whatever the
   * keyboard layout produces: with a Cyrillic layout active Ctrl+C arrives as
   * "с" and never matches. Its fallback to `event.keyCode` does not help here,
   * because WebKitGTK does not report the physical key there for non-Latin
   * layouts. `event.code` names the physical key regardless of layout, so
   * every Ctrl shortcut the composer cares about is resolved from that.
   *
   * Keys that carry no character -- Enter, Escape, the arrows -- are unaffected
   * and stay in the keymap above.
   */
  addProseMirrorPlugins() {
    const handlers = () => this.options.handlers();
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey("composerPhysicalShortcuts"),
        props: {
          handleKeyDown: (view, event) => {
            if (!event.ctrlKey || event.altKey || event.metaKey) return false;

            switch (event.code) {
              case "KeyC":
                // With a selection Ctrl+C must still copy, which is how a
                // terminal behaves too.
                if (!view.state.selection.empty) return false;
                return handlers().interrupt();
              case "KeyZ":
                return event.shiftKey
                  ? editor.commands.redo()
                  : editor.commands.undo();
              case "KeyY":
                return editor.commands.redo();
              case "Backspace":
                return deleteWordBackward(view);
              default:
                return false;
            }
          },
        },
      }),
    ];
  },
});

/**
 * Ctrl+Backspace: the word before the caret, and the spaces after it.
 *
 * The browser would do this itself, but tiptap binds Mod-Backspace to its own
 * chain of commands, and with a caret in the middle of a line they all decline
 * and the key stops there. So it is done outright: back over spaces, then over
 * the word. At the start of a line, or against an attachment, the key is left
 * to the usual Backspace handling, which joins lines and removes the node.
 */
function deleteWordBackward(view: EditorView): boolean {
  const { state } = view;
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return false;

  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const length = wordEraseLength(before);
  if (!length) return false;

  view.dispatch(state.tr.delete($from.pos - length, $from.pos).scrollIntoView());
  return true;
}

/**
 * A deliberately small editor: paragraphs, text, undo/redo, placeholder.
 *
 * This is an input field, not a document editor -- no headings, lists, marks or
 * code blocks. The one structural node is `attachment`.
 */
export function composerExtensions(
  handlers: () => ComposerHandlers,
  /** Read on every render, so it follows the interface language. */
  placeholder: () => string,
  /** The remembered line that continues what is being typed, if any. */
  suggest: (typed: string) => string | null = () => null,
  /** Whose shell decides which commands and paths exist. */
  sessionId: () => string | null = () => null,
) {
  return [
    Document,
    Paragraph,
    Text,
    AttachmentNode,
    UndoRedo,
    Autosuggest.configure({ suggest }),
    Highlight.configure({ sessionId }),
    Placeholder.configure({ placeholder }),
    ComposerKeymap.configure({ handlers }),
  ];
}
