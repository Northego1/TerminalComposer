import type { PointerEvent as ReactPointerEvent } from "react";

interface ComposerResizerProps {
  height: number;
  onResize: (height: number) => void;
}

/** Drag handle on the composer's top edge. Dragging up makes it taller. */
export function ComposerResizer({ height, onResize }: ComposerResizerProps) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;

    const onMove = (move: PointerEvent) =>
      onResize(startHeight - (move.clientY - startY));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="composer-resizer"
      onPointerDown={onPointerDown}
      title="Потяните, чтобы изменить высоту"
    />
  );
}
