import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { composerExtensions, type ComposerHandlers } from "../../editor/createEditor";
import { toMessage } from "../toMessage";

const noHandlers = (): ComposerHandlers => ({
  submit: () => false,
  cancel: () => false,
  recallPrevious: () => false,
  recallNext: () => false,
  interrupt: () => false,
});

const schema = getSchema(composerExtensions(noHandlers, () => ""));

const attachment = (kind: "image" | "file", path: string, name: string) => ({
  type: "attachment",
  attrs: { kind, path, name, mimeType: null, size: null },
});

describe("toMessage", () => {
  it("keeps attachments in the order they appear between the text", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Исправь эту ошибку " },
            attachment("image", "/tmp/shot.png", "shot.png"),
            { type: "text", text: " она после запуска." },
          ],
        },
      ],
    });

    expect(toMessage(doc).blocks).toEqual([
      { type: "text", text: "Исправь эту ошибку " },
      { type: "image", path: "/tmp/shot.png", name: "shot.png" },
      { type: "text", text: " она после запуска." },
    ]);
  });

  it("separates paragraphs with newlines", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "one" }] },
        { type: "paragraph", content: [{ type: "text", text: "two" }] },
      ],
    });
    expect(toMessage(doc).blocks).toEqual([{ type: "text", text: "one\ntwo" }]);
  });

  it("emits a file block for non-image attachments", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [attachment("file", "/tmp/build.log", "build.log")] },
      ],
    });
    expect(toMessage(doc).blocks).toEqual([
      { type: "file", path: "/tmp/build.log", name: "build.log" },
    ]);
  });
});
