import { Fragment, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { keepFocus } from "../app/keepFocus";
import type { Layout, SplitNode } from "../app/layout";
import { getInstance, useTabsStore, type TerminalTab } from "../app/tabsStore";
import { TerminalView } from "./TerminalView";

/**
 * How little of a split a shell may be dragged down to.
 *
 * Small enough to push a shell well out of the way, large enough that what is
 * left is still a terminal and not a sliver that cannot be grabbed again.
 */
const MIN_PANE_PX = 120;

/**
 * A tab's shells, laid out the way its splits say.
 *
 * The layout is a tree, so this draws itself: a split is a flex box holding
 * its children with a splitter between each pair, and a child is either
 * another split or a terminal. That is what lets two shells stacked on the
 * left sit beside a third on the right -- a shape no single direction for the
 * whole tab could describe.
 *
 * Sizes are shares of the split a node sits in rather than pixels, so the
 * layout holds when the window changes size. A drag moves one boundary of one
 * split: everything else stays where the user put it.
 */
export function SplitPanes({ tab, active }: { tab: TerminalTab; active: boolean }) {
  return <Node tab={tab} node={tab.layout} active={active} />;
}

interface NodeProps {
  tab: TerminalTab;
  node: Layout;
  /** Whether its tab is the one on screen. */
  active: boolean;
}

function Node({ tab, node, active }: NodeProps) {
  if (node.kind === "split") return <Split tab={tab} node={node} active={active} />;

  const instance = getInstance(node.id);
  if (!instance) return null;
  return (
    <TerminalView
      instance={instance}
      active={active}
      focused={tab.panes.length > 1 && node.id === tab.paneId}
      share={node.size}
      controls={tab.panes.length > 1}
    />
  );
}

function Split({ tab, node, active }: NodeProps & { node: SplitNode }) {
  const container = useRef<HTMLDivElement>(null);
  const resizeSplit = useTabsStore((state) => state.resizeSplit);

  const startDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    index: number,
  ): void => {
    const element = container.current;
    if (!element || event.button !== 0) return;

    const vertical = node.direction === "column";
    const rect = element.getBoundingClientRect();
    const span = vertical ? rect.height : rect.width;
    if (span === 0) return;

    const before = node.children[index];
    const after = node.children[index + 1];
    const pair = before.size + after.size;
    // The split's shares span the split's own box, which is what turns a
    // distance dragged in pixels into a share.
    const total = node.children.reduce((sum, child) => sum + child.size, 0);
    const perPixel = total / span;
    const min = Math.min(MIN_PANE_PX * perPixel, pair / 2);
    const start = vertical ? event.clientY : event.clientX;

    const splitter = event.currentTarget;
    splitter.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent): void => {
      const moved = (vertical ? move.clientY : move.clientX) - start;
      const size = Math.min(
        Math.max(before.size + moved * perPixel, min),
        pair - min,
      );
      resizeSplit(tab.id, node.id, index, size, pair - size);
    };
    const stop = (): void => {
      splitter.removeEventListener("pointermove", onMove);
      splitter.releasePointerCapture(event.pointerId);
    };

    splitter.addEventListener("pointermove", onMove);
    splitter.addEventListener("pointerup", stop, { once: true });
    splitter.addEventListener("pointercancel", stop, { once: true });
  };

  return (
    <div
      ref={container}
      className={`app__split app__split--${node.direction}`}
      style={{ flexGrow: node.size }}
    >
      {node.children.map((child, index) => (
        <Fragment key={child.id}>
          {index > 0 && (
            <div
              className="app__splitter"
              role="separator"
              aria-orientation={
                node.direction === "column" ? "horizontal" : "vertical"
              }
              {...keepFocus}
              onPointerDown={(event) => startDrag(event, index - 1)}
            />
          )}
          <Node tab={tab} node={child} active={active} />
        </Fragment>
      ))}
    </div>
  );
}
