export type CompletionIntent = "idle" | "seek";

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
 * it. Movement freeze keys on this component's presence — NOT on
 * AgentTaskState.status — so a user release can lift the hold while the
 * agent-reported status stays on the pet.
 */
export type TaskMovementHoldComponent = {
  type: "TaskMovementHold";
  since: number;
};

export type AgentChannelSource = "agent-task" | "agent-hook" | "backend";

export type AgentChannelStatus =
  | "working"
  | "waiting"
  | "completed"
  | "failed";

export type AgentChannelStateComponent = {
  type: "AgentChannelState";
  source: AgentChannelSource;
  status: AgentChannelStatus;
  label: string;
  message: string | null;
  updatedAt: number;
  expiresAt: number | null;
};

/** Default speech lines used when an event does not provide its own summary. */
export type SpeechProfileComponent = {
  type: "SpeechProfile";
  idleCompanion: string;
  attentionNeeded: string;
  taskStarted: string | null;
  taskCompleted: string | null;
};

/** Live speech bubble state. SpeechProfile defines defaults; this stores output. */
export type SpeechStateComponent = {
  type: "SpeechState";
  speech: string | null;
  expiresAt?: number | null;
};

/** Runtime capability that triggers speech after the entity has been idle. */
export type IdleConversationComponent = {
  type: "IdleConversation";
  idleAfterMs: number;
};
