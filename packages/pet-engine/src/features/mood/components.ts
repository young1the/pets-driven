export type PetExperienceKind =
  | "petted"
  | "startled"
  | "task-started"
  | "task-waiting"
  | "task-failed"
  | "task-completed"
  | "socialized"
  | "acknowledged"
  | "rested"
  | "self-soothed"
  | "played";

/** Short-lived affect that changes how the next few decisions are weighted. */
export type MoodStateComponent = {
  type: "MoodState";
  /** Negative to positive feeling, clamped to -1..1. */
  valence: number;
  /** Calm to activated, clamped to 0..1. */
  arousal: number;
  /** Hesitant to assured, clamped to 0..1. */
  confidence: number;
};

export type RecentExperience = {
  kind: PetExperienceKind;
  at: number;
  valenceDelta: number;
  arousalDelta: number;
  confidenceDelta: number;
};

/** Bounded, session-local memory of the experiences currently shaping Mood. */
export type RecentExperienceMemoryComponent = {
  type: "RecentExperienceMemory";
  entries: RecentExperience[];
};

