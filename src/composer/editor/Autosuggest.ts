import { Extension } from "@tiptap/core";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";

import { docToText } from "./documentText";

/**
 * The rest of a remembered command, shown in grey after the caret.
 *
 * The habit comes from the shell: you start typing something you have run
 * before and the remainder appears, ready to be taken with the right arrow.
 * Nothing is inserted until it is -- the text stays exactly what was typed.
 *
 * Offered only at the end of a single-line document: with a caret in the middle
 * of a message the continuation would be a guess about text that is already
 * there.
 */
export const Autosuggest = Extension.create<{
  /** The remembered line that continues this one, if any. */
  suggest: (typed: string) => string | null;
}>({
  name: "autosuggest",

  addOptions() {
    return { suggest: () => null };
  },

  addKeyboardShortcuts() {
    const take = () => {
      const rest = suggestionFor(this.editor.state, this.options.suggest);
      if (!rest) return false;
      this.editor.commands.insertContent(rest);
      return true;
    };
    return { ArrowRight: take, End: take };
  },

  addProseMirrorPlugins() {
    const suggest = this.options.suggest;

    return [
      new Plugin({
        key: new PluginKey("autosuggest"),
        props: {
          decorations(state) {
            const rest = suggestionFor(state, suggest);
            if (!rest) return null;

            return DecorationSet.create(state.doc, [
              Decoration.widget(state.selection.from, () => {
                const ghost = document.createElement("span");
                ghost.className = "composer__ghost";
                ghost.textContent = rest;
                return ghost;
              }),
            ]);
          },
        },
      }),
    ];
  },
});

function suggestionFor(
  state: EditorState,
  suggest: (typed: string) => string | null,
): string | null {
  const { from, empty } = state.selection;
  if (!empty) return null;
  // Only at the very end, and only while this is still one line.
  if (from !== state.doc.content.size - 1) return null;
  if (state.doc.childCount > 1) return null;

  const typed = docToText(state.doc);
  if (!typed) return null;
  return suggest(typed);
}
