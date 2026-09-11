import { getCurrentWindow } from "@tauri-apps/api/window";

import { keepFocus } from "./keepFocus";

/**
 * The window's own resize border, which it does not otherwise have.
 *
 * `decorations: false` buys the header we draw ourselves, and takes the frame
 * away with them -- edges and corners included, so the window compositor has
 * nothing left to grab and the window is stuck at its starting size. These are
 * that border: strips along the four edges and squares in the corners, over
 * everything and invisible, each asking the window manager to resize in its
 * own direction.
 *
 * `ResizeDirection` is not exported by the API, so the eight directions are
 * spelled out here; they are the strings `startResizeDragging` accepts.
 */
type Direction =
  | "North"
  | "NorthEast"
  | "East"
  | "SouthEast"
  | "South"
  | "SouthWest"
  | "West"
  | "NorthWest";

const DIRECTIONS: Direction[] = [
  "North",
  "NorthEast",
  "East",
  "SouthEast",
  "South",
  "SouthWest",
  "West",
  "NorthWest",
];

export function ResizeHandles() {
  const window = getCurrentWindow();

  return (
    <>
      {DIRECTIONS.map((direction) => (
        <div
          key={direction}
          className={`resize-handle resize-handle--${direction.toLowerCase()}`}
          aria-hidden="true"
          {...keepFocus}
          // The press starts a drag the window manager owns from then on, so
          // only the button that resizes is taken.
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            void window.startResizeDragging(direction);
          }}
        />
      ))}
    </>
  );
}
