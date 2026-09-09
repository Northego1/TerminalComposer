import { describe, expect, it } from "vitest";

import { neighbour, sideOf, type PaneBox } from "../neighbour";

const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

/** Two stacked on the left of a third: the layout a flat list could not hold.
 *
 *   +-----+-----+
 *   |  a  |     |
 *   +-----+  c  |
 *   |  b  |     |
 *   +-----+-----+
 */
const panes: PaneBox[] = [
  { id: "a", box: box(0, 0, 100, 50) },
  { id: "b", box: box(0, 50, 100, 100) },
  { id: "c", box: box(100, 0, 200, 100) },
];

describe("neighbour", () => {
  it("finds the shell on the side asked for", () => {
    expect(neighbour(panes, "a", "down")).toBe("b");
    expect(neighbour(panes, "b", "up")).toBe("a");
    expect(neighbour(panes, "a", "right")).toBe("c");
    expect(neighbour(panes, "c", "left")).toBe("a");
  });

  it("is null at the edge of the tab", () => {
    expect(neighbour(panes, "a", "left")).toBeNull();
    expect(neighbour(panes, "c", "right")).toBeNull();
    expect(neighbour(panes, "c", "up")).toBeNull();
  });

  it("ignores a shell that does not lie across the way it is looking", () => {
    // Right of "a" there is only "c": "b" is below it, not beside it.
    expect(neighbour(panes, "b", "right")).toBe("c");
    expect(neighbour(panes, "b", "down")).toBeNull();
  });

  it("takes the nearest when several lie that way", () => {
    const row: PaneBox[] = [
      { id: "a", box: box(0, 0, 100, 100) },
      { id: "b", box: box(100, 0, 200, 100) },
      { id: "c", box: box(200, 0, 300, 100) },
    ];
    expect(neighbour(row, "a", "right")).toBe("b");
  });

  it("prefers the one it is level with when two are equally near", () => {
    const column: PaneBox[] = [
      { id: "a", box: box(0, 0, 100, 100) },
      { id: "top", box: box(100, 0, 200, 40) },
      { id: "middle", box: box(100, 40, 200, 100) },
    ];
    // Looking right from "a", whose middle is at 50: "middle" spans it.
    expect(neighbour(column, "a", "right")).toBe("middle");
  });
});

describe("sideOf", () => {
  const target = box(0, 0, 100, 100);

  it("reads the nearest edge, as a share of the box", () => {
    expect(sideOf(target, 10, 50)).toBe("left");
    expect(sideOf(target, 90, 50)).toBe("right");
    expect(sideOf(target, 50, 5)).toBe("top");
    expect(sideOf(target, 50, 95)).toBe("bottom");
  });

  it("measures a wide box and a tall one the same way", () => {
    // A tenth of the way in from the left, in a box ten times as wide as it
    // is tall: still the left edge, not the top.
    expect(sideOf(box(0, 0, 1000, 100), 100, 40)).toBe("left");
  });
});
