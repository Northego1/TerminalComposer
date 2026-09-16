/**
 * Which shell is next to which, read off the screen rather than off the tree.
 *
 * A nested layout has no "next" and "previous" that mean anything to the eye:
 * the shell to the right of this one may be a cousin three splits away. What
 * the eye does is look in a direction, so that is what this does -- the boxes
 * are the ones the terminals actually occupy, and the answer is the box that
 * lies that way and is closest to where the eye started.
 */

/** The part of a `DOMRect` this needs; plain objects make it testable. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PaneBox {
  id: string;
  box: Box;
}

export type Direction = "left" | "right" | "up" | "down";

const HORIZONTAL: Direction[] = ["left", "right"];

/**
 * The shell to the given side of `fromId`, or null when there is none.
 *
 * Only boxes that actually lie that way are considered, and of those only the
 * ones that overlap the starting box across the direction of travel -- looking
 * right from a shell means the shells beside it, not the one in the far corner
 * that happens to be further right. The nearest of them wins, and ties go to
 * the one whose middle is closest, which is what picks the neighbour a person
 * would have pointed at.
 */
export function neighbour(
  panes: PaneBox[],
  fromId: string,
  direction: Direction,
): string | null {
  const from = panes.find((pane) => pane.id === fromId);
  if (!from) return null;

  const horizontal = HORIZONTAL.includes(direction);
  const candidates = panes.filter((pane) => {
    if (pane.id === fromId) return false;
    const { box } = pane;
    // Beyond the edge being left, with a pixel of tolerance for the hairline
    // between two neighbours.
    const beyond =
      direction === "left"
        ? box.right <= from.box.left + 1
        : direction === "right"
          ? box.left >= from.box.right - 1
          : direction === "up"
            ? box.bottom <= from.box.top + 1
            : box.top >= from.box.bottom - 1;
    if (!beyond) return false;
    // Overlapping across that direction, so it is a neighbour and not a
    // stranger in another corner.
    return horizontal
      ? box.bottom > from.box.top && box.top < from.box.bottom
      : box.right > from.box.left && box.left < from.box.right;
  });
  if (candidates.length === 0) return null;

  const gap = (pane: PaneBox): number =>
    direction === "left"
      ? from.box.left - pane.box.right
      : direction === "right"
        ? pane.box.left - from.box.right
        : direction === "up"
          ? from.box.top - pane.box.bottom
          : pane.box.top - from.box.bottom;

  const across = (pane: PaneBox): number =>
    horizontal
      ? Math.abs(middle(pane.box.top, pane.box.bottom) - middle(from.box.top, from.box.bottom))
      : Math.abs(middle(pane.box.left, pane.box.right) - middle(from.box.left, from.box.right));

  return candidates.reduce((best, pane) => {
    const closer = gap(pane) - gap(best);
    if (closer < 0) return pane;
    if (closer > 0) return best;
    return across(pane) < across(best) ? pane : best;
  }).id;
}

/**
 * Which side of a box a point is nearest, as a fraction of the box rather than
 * in pixels: a tall pane and a wide one both split down the middle.
 */
export function sideOf(
  box: Box,
  x: number,
  y: number,
): "left" | "right" | "top" | "bottom" {
  const width = box.right - box.left || 1;
  const height = box.bottom - box.top || 1;
  const horizontal = (x - middle(box.left, box.right)) / width;
  const vertical = (y - middle(box.top, box.bottom)) / height;
  if (Math.abs(horizontal) >= Math.abs(vertical)) {
    return horizontal >= 0 ? "right" : "left";
  }
  return vertical >= 0 ? "bottom" : "top";
}

function middle(from: number, to: number): number {
  return (from + to) / 2;
}
