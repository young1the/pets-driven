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
};

/** Runtime capability that triggers speech after the entity has been idle. */
export type IdleConversationComponent = {
  type: "IdleConversation";
  idleAfterMs: number;
};
