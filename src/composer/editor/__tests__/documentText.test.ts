import { getSchema } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { composerExtensions, type ComposerHandlers } from "../createEditor";
import { docToText, onFirstLine, onLastLine, wordEraseLength } from "../documentText";

/** One paragraph per line -- the shape the editor produces for plain text. */
const textToContent = (text: string) => ({
  type: "doc",
  content: text.split("\n").map((line) =>
    line
      ? { type: "paragraph", content: [{ type: "text", text: line }] }
      : { type: "paragraph" },
  ),
});

const noHandlers = (): ComposerHandlers => ({
  submit: () => false,
  cancel: () => false,
  recallPrevious: () => false,
  recallNext: () => false,
  interrupt: () => false,
  completionMove: () => false,
  completionAccept: () => false,
  completionClose: () => false,
  completionRequest: () => false,
});

const schema = getSchema(composerExtensions(noHandlers, () => ""));

const stateFor = (text: string, caret?: number) => {
  const doc = schema.nodeFromJSON(textToContent(text));
  const state = EditorState.create({ schema, doc });
  if (caret === undefined) return state;
  return state.apply(
    state.tr.setSelection(TextSelection.create(doc, caret)),
  );
};

describe("docToText / textToContent", () => {
  it("round-trips multi-line text", () => {
    const text = "первая строка\nвторая строка";
    expect(docToText(stateFor(text).doc)).toBe(text);
  });

  it("keeps blank lines", () => {
    const text = "сверху\n\nснизу";
    expect(docToText(stateFor(text).doc)).toBe(text);
  });
});

describe("caret edges", () => {
  it("reports the first line only while nothing precedes the caret", () => {
    // Positions: 1 is the start of the first paragraph, 3 is inside it.
    expect(onFirstLine(stateFor("ab\ncd", 3))).toBe(true);
    // 6 is inside the second paragraph.
    expect(onFirstLine(stateFor("ab\ncd", 6))).toBe(false);
  });

  it("reports the last line only while nothing follows the caret", () => {
    expect(onLastLine(stateFor("ab\ncd", 6))).toBe(true);
    expect(onLastLine(stateFor("ab\ncd", 3))).toBe(false);
  });

  it("never recalls while text is selected", () => {
    const state = stateFor("ab\ncd");
    const selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 1, 3)),
    );
    expect(onFirstLine(selected)).toBe(false);
    expect(onLastLine(selected)).toBe(false);
  });
});

describe("wordEraseLength", () => {
  it("takes the word before the caret", () => {
    expect(wordEraseLength("git commit")).toBe(6);
  });

  it("takes trailing spaces together with the word before them", () => {
    expect(wordEraseLength("git commit   ")).toBe(9);
  });

  it("stops at the start of the line", () => {
    expect(wordEraseLength("git")).toBe(3);
    expect(wordEraseLength("")).toBe(0);
  });

  it("leaves an attachment to the ordinary backspace", () => {
    expect(wordEraseLength("see \ufffc")).toBe(0);
    expect(wordEraseLength("\ufffc word")).toBe(4);
  });
});
