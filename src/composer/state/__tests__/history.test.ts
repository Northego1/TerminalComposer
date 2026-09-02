import { describe, expect, it } from "vitest";

import { EMPTY_HISTORY, next, previous, remember } from "../history";

describe("composer history", () => {
  const filled = ["first", "second"].reduce(remember, EMPTY_HISTORY);

  it("walks back through submissions, newest first", () => {
    const back = previous(filled, "")!;
    expect(back.text).toBe("second");
    expect(previous(back.history, "second")!.text).toBe("first");
  });

  it("stops at the oldest entry", () => {
    const oldest = previous(previous(filled, "")!.history, "")!;
    expect(previous(oldest.history, "")).toBeNull();
  });

  it("brings the draft back when walking past the newest entry", () => {
    const back = previous(filled, "half-typed thought")!;
    expect(back.text).toBe("second");
    const forward = next(back.history)!;
    expect(forward.text).toBe("half-typed thought");
    expect(next(forward.history)).toBeNull();
  });

  it("ignores empty submissions and consecutive duplicates", () => {
    expect(remember(EMPTY_HISTORY, "   ").entries).toEqual([]);
    expect(remember(filled, "second").entries).toEqual(["first", "second"]);
  });
});
