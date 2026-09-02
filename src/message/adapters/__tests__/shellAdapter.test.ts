import { describe, expect, it } from "vitest";

import type { Message } from "../../types";
import { shellAdapter, shellQuote } from "../shellAdapter";

const WITH_PASTE = { bracketedPaste: true };
const WITHOUT_PASTE = { bracketedPaste: false };

const message = (...blocks: Message["blocks"]): Message => ({ blocks });

describe("shellAdapter", () => {
  it("wraps multi-line input in a bracketed paste when the target supports it", () => {
    const out = shellAdapter.serialize(
      message({ type: "text", text: "line one\nline two" }),
      WITH_PASTE,
    );
    expect(out).toBe("\x1b[200~line one\rline two\x1b[201~\r");
  });

  it("sends plain text when the target has not enabled bracketed paste", () => {
    const out = shellAdapter.serialize(
      message({ type: "text", text: "echo hi" }),
      WITHOUT_PASTE,
    );
    expect(out).toBe("echo hi\r");
  });

  it("keeps attachments in place as quoted paths", () => {
    const out = shellAdapter.serialize(
      message(
        { type: "text", text: "Исправь эту ошибку" },
        { type: "image", path: "/tmp/my shot.png", name: "my shot.png" },
        { type: "text", text: "она появляется после запуска." },
      ),
      WITHOUT_PASTE,
    );
    expect(out).toBe(
      "Исправь эту ошибку '/tmp/my shot.png' она появляется после запуска.\r",
    );
  });

  it("produces nothing for an empty message", () => {
    expect(shellAdapter.serialize(message({ type: "text", text: "  " }), WITH_PASTE)).toBe("");
  });
});

describe("shellQuote", () => {
  it("leaves safe paths untouched", () => {
    expect(shellQuote("/tmp/screenshot.png")).toBe("/tmp/screenshot.png");
  });

  it("quotes paths with spaces and single quotes", () => {
    expect(shellQuote("/tmp/it's here.log")).toBe("'/tmp/it'\\''s here.log'");
  });
});
