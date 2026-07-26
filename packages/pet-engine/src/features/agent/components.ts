export type CompletionIntent = "stand" | "arrive";

/** Connects a pet entity to the external agent or hook source it represents. */
export type AgentBindingComponent = {
  type: "AgentBinding";
  sourceId: string;
};

/** Tracks when the entity last received meaningful activity from its source. */
export type ActivityStateComponent = {
  type: "ActivityState";
  lastActiveAt: number;
};

/** Runtime behavior selected when a source reports task completion. */
export type CompletionBehaviorComponent = {
  type: "CompletionBehavior";
  intentAfterCompletion: CompletionIntent;
};

/**
 * Movement hold imposed while a task sits in a freezing status. Added on the
 * freezing transition and removed when the agent moves the pet on to a
 * non-freezing status, or when the user releases the pet by interacting with
 * it. A user release also clears the settled AgentTaskState (and its
 * agent-task channel badge) — interacting means "acknowledged, back to idle".
 * Movement freeze keys on this component's presence — NOT on
 * AgentTaskState.status.
 */
export type TaskMovementHoldComponent = {
  type: "TaskMovementHold";
  since: number;
};

/**
 * The kind of work the bound agent was last seen doing, from its tool-use
 * hooks. Written on every tool pulse and read by the working behavior to pick
 * a pose, so the pet acts out real work instead of an unrelated loop.
 *
 * `family` is null when the agent reported no usable tool name (every Codex
 * hook, and MCP tools whose names say nothing) — the pet then keeps its own
 * personality's pose. Stale entries are ignored rather than cleaned up: a pet
 * whose agent stopped calling tools falls back to its personality on its own.
 */
export type AgentToolActivityComponent = {
  type: "AgentToolActivity";
  family: import("@pets-driven/pet-engine/features/agent/tool-families").AgentToolFamily | null;
  at: number;
};

export type AgentChannelSource =
  // Agent-driven statuses (carry a working/waiting/failed/completed status).
  | "agent-task"
  | "agent-hook"
  | "backend"
  // Folded-in spoken lines that used to live on SpeechState. These carry no
  // agent status (status: null) — the capsule falls back to the ambient
  // activity label ("Chatting with Otto") while `message` holds the line.
  | "social"
  | "idle"
  | "interaction";

export type AgentChannelStatus = "working" | "waiting" | "completed" | "failed";

/**
 * The pet's single spoken-line channel. `message` is the one line shown in the
 * status card; `status`/`label` drive the agent capsule when present, or are
 * null for plain utterances (social/idle/acknowledge). `expiresAt` is the
 * message's TTL: when it lapses the line clears, and if there is no status the
 * whole component is removed. Freezing statuses (waiting/failed/completed) keep
 * `expiresAt: null` so they persist until the user acknowledges the pet.
 */
export type AgentChannelStateComponent = {
  type: "AgentChannelState";
  source: AgentChannelSource;
  status: AgentChannelStatus | null;
  label: string | null;
  message: string | null;
  updatedAt: number;
  expiresAt: number | null;
};

/**
 * Build a plain spoken-line channel (no agent status) with a TTL — the single
 * home for the lines that used to live on SpeechState (social/idle/acknowledge).
 * A null/empty line yields a quiet, non-expiring shell the caller can clear on.
 */
export function utteranceChannel(params: {
  message: string | null;
  source: AgentChannelSource;
  now: number;
  durationMs: number;
}): AgentChannelStateComponent {
  const { message, source, now, durationMs } = params;
  return {
    type: "AgentChannelState",
    source,
    status: null,
    label: null,
    message,
    updatedAt: now,
    expiresAt: message ? now + durationMs : null,
  };
}

/** Default speech lines used when an event does not provide its own summary. */
export type SpeechProfileComponent = {
  type: "SpeechProfile";
  idleCompanion: string;
  attentionNeeded: string;
  taskStarted: string | null;
  taskCompleted: string | null;
};

/** Runtime capability that triggers speech after the entity has been idle. */
export type IdleConversationComponent = {
  type: "IdleConversation";
  idleAfterMs: number;
};
