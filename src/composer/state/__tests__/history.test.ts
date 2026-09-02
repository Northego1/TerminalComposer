import { describe, expect, it } from "vitest";

import { EMPTY_HISTORY, next, previous, remember, type Draft } from "../history";

const draft = (text: string): Draft => ({
  doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  text,
});

describe("composer history", () => {
  const filled = [draft("first"), draft("second")].reduce(remember, EMPTY_HISTORY);

  it("walks back through submissions, newest first", () => {
    const back = previous(filled, draft(""))!;
    expect(back.draft.text).toBe("second");
    expect(previous(back.history, back.draft)!.draft.text).toBe("first");
  });

  it("stops at the oldest entry", () => {
    const oldest = previous(previous(filled, draft(""))!.history, draft(""))!;
    expect(previous(oldest.history, oldest.draft)).toBeNull();
  });

  it("brings the draft back when walking past the newest entry", () => {
    const back = previous(filled, draft("half-typed thought"))!;
    expect(back.draft.text).toBe("second");
    const forward = next(back.history)!;
    expect(forward.draft.text).toBe("half-typed thought");
    expect(next(forward.history)).toBeNull();
  });

  it("recalls the whole document, so attachments come back too", () => {
    const withImage: Draft = {
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "attachment", attrs: { kind: "image", path: "/tmp/a.png", name: "a.png" } },
            ],
          },
        ],
      },
      text: "",
    };
    const history = remember(EMPTY_HISTORY, withImage);
    expect(previous(history, draft(""))!.draft.doc).toEqual(withImage.doc);
  });

  it("ignores a resubmission of the same document", () => {
    expect(remember(filled, draft("second")).entries).toHaveLength(2);
  });
});
