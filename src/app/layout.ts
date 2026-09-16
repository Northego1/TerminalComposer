/**
 * Where a tab's shells sit relative to each other.
 *
 * A flat list can only say "all beside each other" or "all above each other".
 * What a split actually does is divide *one* shell, leaving its neighbours
 * alone -- two shells stacked on the left of a third is an ordinary thing to
 * want, and no single direction describes it. So the layout is a tree: splits
 * with a direction, shells at the leaves, and every node holding its share of
 * whatever contains it.
 *
 * The tree carries no terminal state, only ids and sizes; the shells
 * themselves stay in the tab's `panes`, which is still the list everything
 * else -- the rail, the keyboard, closing -- reads.
 *
 * Every function here returns a new tree rather than changing the one it was
 * given, so the store's state stays comparable by identity.
 */

/** Shells beside each other, or one above the other. */
export type SplitDirection = "row" | "column";

/** One shell, taking `size` of whatever it sits in. */
export interface PaneNode {
  kind: "pane";
  /** The PTY session's id, which is also the pane's id. */
  id: string;
  size: number;
}

/** Two or more nodes divided in one direction. */
export interface SplitNode {
  kind: "split";
  /** Its own id, so a drag can name the boundary it moves. */
  id: string;
  direction: SplitDirection;
  size: number;
  children: Layout[];
}

export type Layout = PaneNode | SplitNode;

export function paneNode(id: string, size = 1): PaneNode {
  return { kind: "pane", id, size };
}

/** The shells the tree holds, in the order they are drawn. */
export function panesOf(node: Layout): string[] {
  return node.kind === "pane" ? [node.id] : node.children.flatMap(panesOf);
}

/** Which side of a shell another one is put on. */
export type Side = "left" | "right" | "top" | "bottom";

const DIRECTION_OF: Record<Side, SplitDirection> = {
  left: "row",
  right: "row",
  top: "column",
  bottom: "column",
};

/**
 * Puts a shell next to another one, on the side asked for.
 *
 * It takes half of the shell it is put beside and nothing else moves. When
 * that shell already sits in a split running the same way, the new one joins
 * it rather than nesting inside it -- three shells in a row are three children
 * of one split, so the two boundaries between them behave the same way. The
 * other way round it nests, which is what makes a mixed layout possible.
 */
export function insertPane(
  node: Layout,
  besideId: string,
  side: Side,
  added: string,
  newId: () => string,
): Layout {
  const direction = DIRECTION_OF[side];
  const first = side === "left" || side === "top";

  if (node.kind === "pane") {
    if (node.id !== besideId) return node;
    // The split takes the shell's place and its share of the parent; inside
    // it, the two halves are equal, and a share is only ever read against its
    // own siblings.
    const pair = [paneNode(node.id), paneNode(added)];
    return {
      kind: "split",
      id: newId(),
      direction,
      size: node.size,
      children: first ? [pair[1], pair[0]] : pair,
    };
  }

  const index = node.children.findIndex(
    (child) => child.kind === "pane" && child.id === besideId,
  );
  if (index >= 0 && node.direction === direction) {
    const target = node.children[index];
    const half = target.size / 2;
    const children = [...node.children];
    children[index] = { ...target, size: half };
    children.splice(first ? index : index + 1, 0, paneNode(added, half));
    return { ...node, children };
  }

  return {
    ...node,
    children: node.children.map((child) =>
      insertPane(child, besideId, side, added, newId),
    ),
  };
}

/**
 * Splits one shell in two: the new one appears after it, in the direction
 * asked for.
 */
export function splitPane(
  node: Layout,
  paneId: string,
  direction: SplitDirection,
  added: string,
  newId: () => string,
): Layout {
  return insertPane(
    node,
    paneId,
    direction === "row" ? "right" : "bottom",
    added,
    newId,
  );
}

/**
 * Moves a shell that is already in the tree to the side of another one.
 *
 * Taking it out first is what makes this a move rather than a copy, and it is
 * also what can collapse the split it was in -- dropping a shell next to its
 * own neighbour must leave one split, not two. Dropping a shell onto itself
 * changes nothing.
 */
export function movePane(
  node: Layout,
  paneId: string,
  besideId: string,
  side: Side,
  newId: () => string,
): Layout {
  if (paneId === besideId) return node;
  const without = removePane(node, paneId);
  if (!without) return node;
  return insertPane(without, besideId, side, paneId, newId);
}

/**
 * Takes a shell out of the tree.
 *
 * Its space goes to the neighbour that takes its place, rather than being
 * shared out and moving every boundary on screen. A split left holding one
 * child is no longer a split, so it collapses into that child and gives it the
 * space it had -- otherwise closing shells would leave a stack of divisions
 * that divide nothing.
 *
 * Returns null when the removed shell was the last one; a tab with no shells
 * closes itself.
 */
export function removePane(node: Layout, paneId: string): Layout | null {
  if (node.kind === "pane") return node.id === paneId ? null : node;

  const index = node.children.findIndex((child) =>
    panesOf(child).includes(paneId),
  );
  if (index < 0) return node;

  const children = node.children.flatMap((child) => {
    const kept = removePane(child, paneId);
    return kept ? [kept] : [];
  });
  if (children.length === 0) return null;
  // The shell went from somewhere further down, and only that split's own
  // children moved.
  if (children.length === node.children.length) return { ...node, children };

  const heir = Math.min(index, children.length - 1);
  children[heir] = {
    ...children[heir],
    size: children[heir].size + node.children[index].size,
  };

  if (children.length === 1) return { ...children[0], size: node.size };
  return { ...node, children };
}

/** Moves one boundary of one split, leaving every other boundary alone. */
export function resize(
  node: Layout,
  splitId: string,
  index: number,
  before: number,
  after: number,
): Layout {
  if (node.kind === "pane") return node;
  if (node.id === splitId) {
    return {
      ...node,
      children: node.children.map((child, at) =>
        at === index
          ? { ...child, size: before }
          : at === index + 1
            ? { ...child, size: after }
            : child,
      ),
    };
  }
  return {
    ...node,
    children: node.children.map((child) =>
      resize(child, splitId, index, before, after),
    ),
  };
}

/**
 * What is written to disk: the same tree with session ids replaced by
 * positions in the tab's list of shells, since ids are handed out afresh every
 * time the shells are spawned again.
 */
export type PersistedLayout =
  | { kind: "pane"; index: number; size: number }
  | {
      kind: "split";
      direction: SplitDirection;
      size: number;
      children: PersistedLayout[];
    };

export function toPersisted(
  node: Layout,
  indexOf: (paneId: string) => number,
): PersistedLayout {
  if (node.kind === "pane") {
    return { kind: "pane", index: indexOf(node.id), size: node.size };
  }
  return {
    kind: "split",
    direction: node.direction,
    size: node.size,
    children: node.children.map((child) => toPersisted(child, indexOf)),
  };
}

/**
 * The tree again, with the shells that came back in place of the positions.
 *
 * A shell that failed to spawn leaves its position empty, and the split it was
 * in closes over the gap the way it would if it had been closed by hand.
 */
export function fromPersisted(
  node: PersistedLayout,
  paneIds: Array<string | undefined>,
  newId: () => string,
): Layout | null {
  if (node.kind === "pane") {
    const id = paneIds[node.index];
    return id ? paneNode(id, node.size) : null;
  }
  const children = node.children.flatMap((child) => {
    const kept = fromPersisted(child, paneIds, newId);
    return kept ? [kept] : [];
  });
  if (children.length === 0) return null;
  if (children.length === 1) return { ...children[0], size: node.size };
  return {
    kind: "split",
    id: newId(),
    direction: node.direction,
    size: node.size,
    children,
  };
}

/**
 * The layout of a tab saved before there were trees: one split holding every
 * shell, in the one direction such a tab could have.
 */
export function flatLayout(
  paneIds: string[],
  direction: SplitDirection,
  sizes: Array<number | undefined>,
  newId: () => string,
): Layout {
  if (paneIds.length === 1) return paneNode(paneIds[0], 1);
  return {
    kind: "split",
    id: newId(),
    direction,
    size: 1,
    children: paneIds.map((id, index) => paneNode(id, sizes[index] ?? 1)),
  };
}
