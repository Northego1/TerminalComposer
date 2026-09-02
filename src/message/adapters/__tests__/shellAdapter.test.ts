import { describe, expect, it } from "vitest";

import type { Message } from "../../types";
import { shellAdapter, shellQuote } from "../shellAdapter";

const WITH_PASTE = { bracketedPaste: true };
const WITHOUT_PASTE = { bracketedPaste: false };

const message = (...blocks: Message["blocks"]): Message => ({ blocks });

describe("shellAdapter", () => {
  it("wraps multi-line input in a bracketed paste when the target supports it", () => {
    const [paste] = shellAdapter.serialize(
      message({ type: "text", text: "line one\nline two" }),
      WITH_PASTE,
    );
    expect(paste.data).toBe("\x1b[200~line one\rline two\x1b[201~");
  });

  it("submits with a separate, delayed CR so TUIs do not swallow it", () => {
    const writes = shellAdapter.serialize(
      message({ type: "text", text: "hello" }),
      WITH_PASTE,
    );
    expect(writes).toHaveLength(2);
    expect(writes[1].data).toBe("\r");
    expect(writes[1].delayBefore).toBeGreaterThan(0);
  });

  it("sends one write when the target has not enabled bracketed paste", () => {
    const writes = shellAdapter.serialize(
      message({ type: "text", text: "echo hi" }),
      WITHOUT_PASTE,
    );
    expect(writes).toEqual([{ data: "echo hi\r" }]);
  });

  it("keeps attachments in place as quoted paths", () => {
    const writes = shellAdapter.serialize(
      message(
        { type: "text", text: "Исправь эту ошибку" },
        { type: "image", path: "/tmp/my shot.png", name: "my shot.png" },
        { type: "text", text: "она появляется после запуска." },
      ),
      WITHOUT_PASTE,
    );
    expect(writes[0].data).toBe(
      "Исправь эту ошибку '/tmp/my shot.png' она появляется после запуска.\r",
    );
  });

  it("produces nothing for an empty message", () => {
    expect(
      shellAdapter.serialize(message({ type: "text", text: "  " }), WITH_PASTE),
    ).toEqual([]);
  });
});

describe("shellAdapter.abort", () => {
  it("interrupts the target and then clears its input line", () => {
    const writes = shellAdapter.abort();
    expect(writes.map((write) => write.data)).toEqual(["\x1b", "\x15"]);
    expect(writes[1].delayBefore).toBeGreaterThan(0);
  });
});

describe("shellAdapter.interrupt", () => {
  it("sends Ctrl+C", () => {
    expect(shellAdapter.interrupt()).toEqual([{ data: "\x03" }]);
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
