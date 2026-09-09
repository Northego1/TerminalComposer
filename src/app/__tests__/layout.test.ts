import { describe, expect, it } from "vitest";

import {
  flatLayout,
  insertPane,
  movePane,
  fromPersisted,
  panesOf,
  paneNode,
  removePane,
  resize,
  splitPane,
  toPersisted,
  type Layout,
} from "../layout";

/** Predictable ids, so a tree can be compared to a written-out one. */
function ids(): () => string {
  let n = 0;
  return () => `s${(n += 1)}`;
}

/** What the tree looks like, as "a|b" for a row and "a/b" for a column. */
function shape(node: Layout): string {
  if (node.kind === "pane") return node.id;
  return `(${node.children.map(shape).join(node.direction === "row" ? "|" : "/")})`;
}

describe("splitPane", () => {
  it("turns one shell into two, in the direction asked for", () => {
    const tree = splitPane(paneNode("a"), "a", "column", "b", ids());
    expect(shape(tree)).toBe("(a/b)");
  });

  it("splits only the shell it was given, leaving its neighbours alone", () => {
    const row = splitPane(paneNode("a"), "a", "row", "b", ids());
    const nested = splitPane(row, "a", "column", "c", ids());
    // Two stacked on the left of the third: the case a single direction per
    // tab could not express.
    expect(shape(nested)).toBe("((a/c)|b)");
  });

  it("extends a split rather than nesting when the direction is the same", () => {
    const row = splitPane(paneNode("a"), "a", "row", "b", ids());
    const three = splitPane(row, "b", "row", "c", ids());
    expect(shape(three)).toBe("(a|b|c)");
  });

  it("halves the share of the shell it splits and no other", () => {
    const newId = ids();
    const row = splitPane(paneNode("a"), "a", "row", "b", newId);
    const three = splitPane(row, "b", "row", "c", newId);
    const sizes = three.kind === "split" ? three.children.map((c) => c.size) : [];
    expect(sizes).toEqual([1, 0.5, 0.5]);
  });
});

describe("removePane", () => {
  it("gives the space to the neighbour that takes its place", () => {
    const newId = ids();
    let tree = splitPane(paneNode("a"), "a", "row", "b", newId);
    tree = splitPane(tree, "b", "row", "c", newId);
    const left = removePane(tree, "c");
    expect(left && shape(left)).toBe("(a|b)");
    const sizes = left?.kind === "split" ? left.children.map((c) => c.size) : [];
    expect(sizes).toEqual([1, 1]);
  });

  it("collapses a split that is left with one child", () => {
    const newId = ids();
    const row = splitPane(paneNode("a"), "a", "row", "b", newId);
    const nested = splitPane(row, "a", "column", "c", newId);
    const left = removePane(nested, "c");
    expect(left && shape(left)).toBe("(a|b)");
  });

  it("is null when the last shell goes", () => {
    expect(removePane(paneNode("a"), "a")).toBeNull();
  });

  it("keeps the tree whole when the shell is not in it", () => {
    const tree = splitPane(paneNode("a"), "a", "row", "b", ids());
    expect(shape(removePane(tree, "z")!)).toBe("(a|b)");
  });
});

describe("resize", () => {
  it("moves one boundary and leaves the others alone", () => {
    const newId = ids();
    let tree = splitPane(paneNode("a"), "a", "row", "b", newId);
    tree = splitPane(tree, "b", "row", "c", newId);
    const split = tree.kind === "split" ? tree : null;
    const moved = resize(tree, split!.id, 0, 1.5, 0.5);
    const sizes = moved.kind === "split" ? moved.children.map((c) => c.size) : [];
    expect(sizes).toEqual([1.5, 0.5, 0.5]);
  });
});

describe("persistence", () => {
  it("comes back as it went, with the shells it was given", () => {
    const newId = ids();
    const row = splitPane(paneNode("a"), "a", "row", "b", newId);
    const tree = splitPane(row, "a", "column", "c", newId);
    const order = panesOf(tree);

    const saved = toPersisted(tree, (id) => order.indexOf(id));
    const back = fromPersisted(saved, order, ids());
    expect(back && shape(back)).toBe(shape(tree));
  });

  it("closes over a shell that failed to come back", () => {
    const tree = splitPane(paneNode("a"), "a", "row", "b", ids());
    const order = panesOf(tree);
    const saved = toPersisted(tree, (id) => order.indexOf(id));
    const back = fromPersisted(saved, ["a", undefined], ids());
    expect(back && shape(back)).toBe("a");
  });

  it("reads a tab saved before there were trees", () => {
    const tree = flatLayout(["a", "b", "c"], "row", [2, 1, undefined], ids());
    expect(shape(tree)).toBe("(a|b|c)");
    const sizes = tree.kind === "split" ? tree.children.map((c) => c.size) : [];
    expect(sizes).toEqual([2, 1, 1]);
  });
});

describe("insertPane and movePane", () => {
  it("puts a shell on the side asked for", () => {
    const left = insertPane(paneNode("a"), "a", "left", "b", ids());
    expect(shape(left)).toBe("(b|a)");
    const top = insertPane(paneNode("a"), "a", "top", "b", ids());
    expect(shape(top)).toBe("(b/a)");
  });

  it("joins a split running the same way instead of nesting", () => {
    const newId = ids();
    const row = splitPane(paneNode("a"), "a", "row", "b", newId);
    const three = insertPane(row, "b", "left", "c", newId);
    expect(shape(three)).toBe("(a|c|b)");
  });

  it("moves a shell without leaving a copy behind", () => {
    const newId = ids();
    let tree = splitPane(paneNode("a"), "a", "row", "b", newId);
    tree = splitPane(tree, "b", "row", "c", newId);
    const moved = movePane(tree, "c", "a", "top", newId);
    expect(shape(moved)).toBe("((c/a)|b)");
    expect(panesOf(moved).sort()).toEqual(["a", "b", "c"]);
  });

  it("collapses the split the shell came out of", () => {
    const newId = ids();
    let tree = splitPane(paneNode("a"), "a", "row", "b", newId);
    tree = splitPane(tree, "b", "column", "c", newId);
    expect(shape(tree)).toBe("(a|(b/c))");
    const moved = movePane(tree, "c", "a", "left", newId);
    expect(shape(moved)).toBe("(c|a|b)");
  });

  it("leaves the tree alone when a shell is dropped on itself", () => {
    const tree = splitPane(paneNode("a"), "a", "row", "b", ids());
    expect(movePane(tree, "a", "a", "right", ids())).toBe(tree);
  });
});
