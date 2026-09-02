/**
 * Descriptions of what commands accept, shipped with the application.
 *
 * These are the open Fig specs, kept in `./specs` -- see the note there for why
 * they are copied rather than imported. Only a chosen set travels with us, and
 * each one is loaded the moment its command is typed, not before.
 */
export type SpecLoader = () => Promise<{ default: unknown }>;

export const SPECS: Record<string, SpecLoader> = {
  git: () => import("./specs/git.js"),
  npm: () => import("./specs/npm.js"),
  npx: () => import("./specs/npx.js"),
  pnpm: () => import("./specs/pnpm.js"),
  yarn: () => import("./specs/yarn.js"),
  cargo: () => import("./specs/cargo.js"),
  rustup: () => import("./specs/rustup.js"),
  docker: () => import("./specs/docker.js"),
  "docker-compose": () => import("./specs/docker-compose.js"),
  kubectl: () => import("./specs/kubectl.js"),
  ssh: () => import("./specs/ssh.js"),
  scp: () => import("./specs/scp.js"),
  systemctl: () => import("./specs/systemctl.js"),
  apt: () => import("./specs/apt.js"),
  make: () => import("./specs/make.js"),
  curl: () => import("./specs/curl.js"),
  wget: () => import("./specs/wget.js"),
  tar: () => import("./specs/tar.js"),
  grep: () => import("./specs/grep.js"),
  find: () => import("./specs/find.js"),
  sed: () => import("./specs/sed.js"),
  ps: () => import("./specs/ps.js"),
  kill: () => import("./specs/kill.js"),
  tmux: () => import("./specs/tmux.js"),
  gh: () => import("./specs/gh.js"),
  go: () => import("./specs/go.js"),
  python: () => import("./specs/python.js"),
  python3: () => import("./specs/python3.js"),
  pip: () => import("./specs/pip.js"),
  node: () => import("./specs/node.js"),
  deno: () => import("./specs/deno.js"),
  bun: () => import("./specs/bun.js"),
  code: () => import("./specs/code.js"),
  vim: () => import("./specs/vim.js"),
  nano: () => import("./specs/nano.js"),
  rsync: () => import("./specs/rsync.js"),
  chmod: () => import("./specs/chmod.js"),
  chown: () => import("./specs/chown.js"),
  df: () => import("./specs/df.js"),
  du: () => import("./specs/du.js"),
};

const loaded = new Map<string, Promise<unknown>>();

/** The description of a command, or nothing if we do not carry one. */
export function loadSpec(command: string): Promise<unknown> | null {
  const load = SPECS[command];
  if (!load) return null;
  const already = loaded.get(command);
  if (already) return already;
  const pending = load().then((module) => module.default);
  loaded.set(command, pending);
  return pending;
}
