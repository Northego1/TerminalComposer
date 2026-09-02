/**
 * What the agent in a terminal is doing.
 *
 * A terminal cannot tell working from waiting -- the protocol has no such
 * notion. Claude Code reports it through its own hooks, which is a documented
 * interface rather than something read out of its output. Each hook names the
 * session it belongs to, so a background tab can say it needs attention.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AgentState =
  /** The agent is working on the last message. */
  | "working"
  /** It answered; the user's turn. */
  | "waiting"
  /** It needs the user now: a permission, a choice, a question. */
  | "attention";

interface AgentEvent {
  sessionId: string;
  kind: string;
}

const STATE_BY_HOOK: Record<string, AgentState> = {
  // An agent that has just started is waiting for its first message, and that
  // message is written in the composer.
  SessionStart: "waiting",
  UserPromptSubmit: "working",
  Stop: "waiting",
  Notification: "attention",
};

export function onAgentEvent(
  handler: (sessionId: string, state: AgentState) => void,
): Promise<UnlistenFn> {
  return listen<AgentEvent>("agent://event", ({ payload }) => {
    const state = STATE_BY_HOOK[payload.kind];
    if (state) handler(payload.sessionId, state);
  });
}

export function hooksInstalled(): Promise<boolean> {
  return invoke<boolean>("agent_hooks_installed").catch(() => false);
}

export function installHooks(): Promise<void> {
  return invoke("agent_hooks_install");
}

export function removeHooks(): Promise<void> {
  return invoke("agent_hooks_remove");
}
