import type { MouseEvent } from "react";

/**
 * Spread onto a control that must not take the keyboard.
 *
 * A button in the chrome -- a tab, the pin, the send button -- is pressed and
 * done with; the keyboard belongs to the terminal or the composer either side
 * of that press. Without this it lands on the button and the next keystroke
 * goes nowhere at all.
 *
 * Text fields are the exception and must not use this: they are what the
 * keyboard is for.
 */
export const keepFocus = {
  onMouseDown: (event: MouseEvent) => event.preventDefault(),
};
