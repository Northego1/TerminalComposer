/**
 * Reading a command description far enough to say what could come next.
 *
 * A description is a tree: a command has subcommands, each with its own
 * subcommands and options. Walking the words already typed finds the level the
 * caret is on, and what is offered is whatever that level accepts.
 *
 * Dynamic values -- the branches for `git checkout`, the containers for
 * `docker stop` -- are deliberately not evaluated: they are produced by running
 * commands, and running things to fill a dropdown is a different decision.
 */

interface Named {
  name: string | string[];
  description?: string;
}

interface Spec extends Named {
  subcommands?: Spec[];
  options?: Named[];
}

export interface SpecSuggestion {
  label: string;
  description?: string;
  kind: "subcommand" | "option";
}

export function suggestFromSpec(
  spec: unknown,
  /** The words after the command itself, the last one being what is typed. */
  words: string[],
  prefix: string,
): SpecSuggestion[] {
  if (!spec || typeof spec !== "object") return [];
  let level = spec as Spec;

  for (const word of words) {
    // Options do not change which subcommand we are in.
    if (word.startsWith("-")) continue;
    const next: Spec | undefined = level.subcommands?.find((sub) =>
      names(sub).includes(word),
    );
    if (!next) break;
    level = next;
  }

  // A word starting with a dash can only be an option; anything else is a
  // subcommand, and there is no point offering flags for it.
  const wantsOption = prefix.startsWith("-");
  const source: Array<[Named[] | undefined, SpecSuggestion["kind"]]> = wantsOption
    ? [[level.options, "option"]]
    : [[level.subcommands, "subcommand"]];

  return source.flatMap(([entries, kind]) =>
    (entries ?? []).flatMap((entry) =>
      names(entry)
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ label: name, description: entry.description, kind })),
    ),
  );
}

function names(entry: Named): string[] {
  return Array.isArray(entry.name) ? entry.name : [entry.name];
}
