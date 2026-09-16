import { describe, expect, it } from "vitest";

import { KeyQueue } from "../keyQueue";

/** A queue and the string it has written out so far. */
function queue() {
  let written = "";
  const keys = new KeyQueue((data) => {
    written += data;
  });
  return { keys, written: () => written };
}

/** The press, letter and release of one key the input method answered. */
function composedKey(keys: KeyQueue, letter: string) {
  keys.press();
  keys.composed(letter);
  keys.release(letter);
}

/** The press and release of one key the input method answered with nothing. */
function swallowedKey(keys: KeyQueue, letter: string) {
  keys.press();
  keys.release(letter);
}

describe("KeyQueue", () => {
  it("writes a readable key straight out", () => {
    const { keys, written } = queue();
    keys.type("a");
    keys.type("b");
    expect(written()).toBe("ab");
  });

  it("writes letters the composition delivered", () => {
    const { keys, written } = queue();
    for (const letter of "привет") composedKey(keys, letter);
    expect(written()).toBe("привет");
  });

  it("takes a swallowed letter from its release instead", () => {
    const { keys, written } = queue();
    for (const letter of "привет") swallowedKey(keys, letter);
    expect(written()).toBe("привет");
  });

  it("keeps letters in order when releases arrive after later presses", () => {
    const { keys, written } = queue();
    // Typing fast: the next key goes down before the last one comes up.
    keys.press();
    keys.press();
    keys.release("п");
    keys.release("р");
    expect(written()).toBe("пр");
  });

  it("holds a readable key behind a letter that has not arrived", () => {
    const { keys, written } = queue();
    keys.press(); // "в", still down
    keys.type(" ");
    expect(written()).toBe("");
    keys.release("в");
    expect(written()).toBe("в ");
  });

  it("does not let a space overtake the letter before it", () => {
    const { keys, written } = queue();
    keys.press();
    keys.type(" ");
    keys.release("в");
    for (const letter of "админку") swallowedKey(keys, letter);
    expect(written()).toBe("в админку");
  });

  it("writes a letter the composition delivered without waiting for release", () => {
    const { keys, written } = queue();
    keys.press();
    keys.composed("п");
    expect(written()).toBe("п");
  });

  it("ignores a release with no press behind it", () => {
    const { keys, written } = queue();
    // Ctrl+U on a Cyrillic layout releases "г" with the same empty keyCode.
    expect(keys.release("г")).toBe(false);
    expect(written()).toBe("");
  });

  it("leaves a real composition's keys to the composition", () => {
    const { keys, written } = queue();
    keys.setComposing(true);
    keys.press();
    keys.release("n");
    keys.press();
    keys.release("i");
    expect(written()).toBe("");
    keys.setComposing(false);
    keys.press();
    keys.composed("你");
    expect(written()).toBe("你");
  });

  it("writes nothing for a release that names a key rather than a letter", () => {
    const { keys, written } = queue();
    keys.press();
    keys.release("Shift");
    expect(written()).toBe("");
  });

  it("gives up on a press whose release never comes, keeping the rest", () => {
    const { keys, written } = queue();
    keys.press();
    keys.type("x");
    expect(written()).toBe("");
    keys.flush(true);
    expect(written()).toBe("x");
  });

  it("reports whether anything is still waiting", () => {
    const { keys } = queue();
    expect(keys.waiting).toBe(false);
    keys.press();
    expect(keys.waiting).toBe(true);
    keys.release("п");
    expect(keys.waiting).toBe(false);
  });

  it("recovers when the composition answers some presses and not others", () => {
    const { keys, written } = queue();
    // The context is recreated mid-burst: the first letter is swallowed, the
    // second composes normally.
    keys.press();
    keys.press();
    keys.composed("р");
    keys.release("п");
    keys.release("р");
    expect(written()).toBe("пр");
  });
});
