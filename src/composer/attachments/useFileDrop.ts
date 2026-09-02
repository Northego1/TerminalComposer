import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Native window drag & drop, narrowed to one element.
 *
 * HTML5 drag & drop inside a webview never hands out real paths -- the same
 * reason the clipboard goes through Rust -- so dropped files arrive as a
 * window-level native event instead. That event reports the cursor in physical
 * pixels, and comparing it with the element's rectangle is what decides whether
 * a drop belongs here.
 */
export function useFileDrop(
  target: RefObject<HTMLElement | null>,
  onDrop: (paths: string[]) => void,
): { dragging: boolean; over: boolean } {
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);

  // Kept in a ref so a changing callback never resubscribes the native listener.
  const handleDrop = useRef(onDrop);
  useEffect(() => {
    handleDrop.current = onDrop;
  });

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    void getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "leave") {
          setDragging(false);
          setOver(false);
          return;
        }

        setDragging(true);
        setOver(isInside(target.current, payload.position));

        if (payload.type === "drop") {
          setDragging(false);
          setOver(false);
          if (isInside(target.current, payload.position) && payload.paths.length) {
            handleDrop.current(payload.paths);
          }
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [target]);

  return { dragging, over };
}

function isInside(
  element: HTMLElement | null,
  position: { x: number; y: number },
): boolean {
  if (!element) return false;
  // The event is in physical pixels; the DOM rectangle is in CSS pixels.
  const ratio = window.devicePixelRatio || 1;
  const x = position.x / ratio;
  const y = position.y / ratio;
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
