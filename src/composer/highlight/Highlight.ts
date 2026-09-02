import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { docToText } from "../editor/documentText";
import { knowsCommand, knowsPath, onResolved } from "./known";
import { tokenizeLine, type LineToken } from "./tokenizeLine";

/**
 * Colouring the command line as it is typed, the way a shell does.
 *
 * A command that exists is green and one that does not is red, so a typo shows
 * before Enter rather than after it. A path that is there is underlined. Both
 * answers come from what the completion already knows, so this adds colour
 * rather than a second source of truth.
 *
 * Only while the composer is a command line: one paragraph, nothing attached.
 * Colouring a message written to an agent would be claiming its words are
 * commands, which they are not.
 */
export const Highlight = Extension.create<{ sessionId: () => string | null }>({
  name: "commandHighlight",

  addOptions() {
    return { sessionId: () => null };
  },

  addProseMirrorPlugins() {
    const sessionId = this.options.sessionId;
    const editor = this.editor;

    // An answer that arrives late still has to be painted.
    onResolved(() => {
      if (editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta("commandHighlight", true));
    });

    return [
      new Plugin({
        key: new PluginKey("commandHighlight"),
        props: {
          decorations: (state) => decorate(state, sessionId()),
        },
      }),
    ];
  },
});

function decorate(state: EditorState, sessionId: string | null): DecorationSet | null {
  if (!sessionId) return null;
  if (state.doc.childCount !== 1) return null;
  if (hasAttachment(state)) return null;

  const line = docToText(state.doc);
  if (!line.trim()) return null;

  const decorations = tokenizeLine(line).flatMap((token) => {
    const className = classOf(token, sessionId);
    return className ? [decorationFor(token, className)] : [];
  });

  return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
}

function decorationFor(token: LineToken, className: string): Decoration {
  // Text in the only paragraph starts at position 1.
  return Decoration.inline(token.start + 1, token.end + 1, { class: className });
}

function classOf(token: LineToken, sessionId: string): string | null {
  switch (token.kind) {
    case "command": {
      const known = knowsCommand(sessionId, token.text);
      if (known === null) return null;
      return known ? "cl-command" : "cl-unknown";
    }
    case "flag":
      return "cl-flag";
    case "string":
      return "cl-string";
    case "word": {
      // Only worth asking about things shaped like a path; a bare argument is
      // usually a value, not a file.
      if (!/[/~.]/.test(token.text)) return null;
      return knowsPath(sessionId, token.text) ? "cl-path" : null;
    }
  }
}

function hasAttachment(state: EditorState): boolean {
  let found = false;
  state.doc.descendants((node) => {
    if (node.type.name === "attachment") found = true;
    return !found;
  });
  return found;
}
