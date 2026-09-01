import type {
  PetExpressionEmote,
  PetExpressionMood,
  PetExpressionSource,
} from "@pets-driven/pet-engine/core/components";
import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type { AgentTaskStatus } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import type {
  AgentChannelSource,
  AgentChannelStatus,
} from "@pets-driven/pet-engine/features/agent/components";
import type { PetItemKind } from "@pets-driven/pet-engine/features/items/components";
import type { WorldPropKind } from "@pets-driven/pet-engine/features/props/components";
import type {
  SocialSessionKind,
  SocialSessionPhase,
} from "@pets-driven/pet-engine/features/social/components";

/** The live social session a pet is part of, if any (for UI display). */
export type SocialSnapshot = {
  kind: SocialSessionKind;
  phase: SocialSessionPhase;
  role: "initiator" | "responder";
  partnerId: string;
  /** The partner pet's display name, resolved engine-side. Null if unknown. */
  partnerName: string | null;
};

export type PetExpressionSnapshot = {
  source: PetExpressionSource;
  mood: PetExpressionMood;
  emote: PetExpressionEmote;
  label: string | null;
  startedAt: number;
  expiresAt: number;
};

export type AgentChannelSnapshot = {
  source: AgentChannelSource;
  /** Null for plain utterances (social/idle/interaction) — no agent status. */
  status: AgentChannelStatus | null;
  /** Null for plain utterances; the capsule falls back to the ambient label. */
  label: string | null;
  message: string | null;
  updatedAt: number;
  expiresAt: number | null;
};

export type BodySnapshot = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  shape: "circle" | "rectangle";
  width: number;
  height: number;
  radius?: number;
  /** Body rotation in radians. Only circles ever spin; rectangles stay at 0. */
  angle?: number;
  isStatic?: boolean;
  animationState?: import("@pets-driven/pet-engine/pets/assets/pet-atlas").PetAnimationState;
  interaction?: InteractionSnapshot;
};

export type PetSnapshot = {
  id: string;
  sourceId: string;
  name: string;
  steering: string;
  locomotion: string;
  /** Current behavior/action overlay, separate from locomotion. */
  action?: string;
  /**
   * Derived read-only mirror of `agentChannel.message` (the engine's single
   * spoken-line source). Kept for playground/showcase convenience; new code
   * should read the line from `agentChannel.message`.
   */
  speech: string | null;
  position: {
    x: number;
    y: number;
  };
  contact: {
    grounded: boolean;
    climbableSurfaceId: string | null;
  };
  motionTarget: { x: number; y: number } | null;
  /**
   * Canonical current activity, derived engine-side with claim-expiry checks
   * (see core/pet-activity.ts). Null when the pet is simply standing by.
   */
  activity?: PetActivityKind | null;
  /** Current drive pressures (0..1, higher = more pressing), if the pet has them. */
  drives?: { social: number; energy: number; curiosity: number } | null;
  /** Short-lived emotional context and number of experiences still in memory. */
  mood?: {
    valence: number;
    arousal: number;
    confidence: number;
    recentExperienceCount: number;
  } | null;
  /** Current behavior decision claim, or null if no active claim. */
  decision: { source: string; reason: string; decidedAt: number } | null;
  /** Active deliberation timer, or null if no pending reaction. */
  pendingReaction: { source: string; reactsAt: number } | null;
  /** Agent task lifecycle surfaced to UI. Absent = idle. */
  agentTask?: AgentTaskSnapshot | null;
  /** Agent-owned speech bubble channel, separate from pet mood reactions. */
  agentChannel?: AgentChannelSnapshot | null;
  /** Presentation cue derived from current behavior, or null when quiet. */
  visualCue?: PetVisualCue | null;
  /** Active visual-only expression overlay, or null when quiet. */
  expression?: PetExpressionSnapshot | null;
  /** Presentation state derived from current user interaction, if any. */
  interaction?: InteractionSnapshot;
  /**
   * The game this pet is on, or absent when it is living its ordinary life.
   * Only ever set for the one pet the world's single session names.
   */
  game?: PetGameSnapshot;
  /** The live social session this pet is in, or null when it is on its own. */
  social?: SocialSnapshot | null;
  /** The trinket ability the pet is wearing, or null when it has none. */
  carrying?: CarriedItemSnapshot | null;
};

/**
 * A pet's side of the world's single game session.
 *
 * `countdown` is the glyph to wear right now (null once the round is under
 * way), resolved in the engine rather than in each host so every surface counts
 * the same three seconds down.
 */
export type PetGameSnapshot = {
  phase: import("@pets-driven/pet-engine/features/game/components").GamePhase;
  control: import("@pets-driven/pet-engine/features/game/components").GameControlSource;
  spawn: import("@pets-driven/pet-engine/features/game/components").GameSpawnSource;
  countdown: string | null;
  score: number;
};

export type InteractionSnapshot = {
  controllable?: boolean;
  selected?: boolean;
  dragged?: boolean;
  controlled?: boolean;
  scale?: number;
};

export type PetVisualCue = {
  kind: "affection" | "flee" | "wander" | "surprised" | "playful";
  icon: string;
  label: string;
};

export type AgentTaskSnapshot = {
  status: AgentTaskStatus;
  label: "WAIT" | "FAIL" | "DONE" | null;
  summary?: string;
};

export type ClimbableSurfaceSnapshot = {
  id: string;
  position: {
    x: number;
    y: number;
  };
};

/** A trinket lying on the desktop, for hosts to draw. */
export type WorldItemSnapshot = {
  id: string;
  kind: PetItemKind;
  position: {
    x: number;
    y: number;
  };
  /** Clock time the uncollected trinket fades at, for a fade-out cue. */
  expiresAt: number;
};

/**
 * A prop lying on the desktop.
 *
 * It carries an `angle` where a trinket does not, because a prop is a body and
 * a rolling ball drawn without its rotation reads as a ball being dragged.
 */
export type WorldPropSnapshot = {
  id: string;
  kind: WorldPropKind;
  position: {
    x: number;
    y: number;
  };
  radius: number;
  /** Body rotation in radians, so a host can spin the glyph as it rolls. */
  angle: number;
};

/** The ability a pet is currently wearing from a collected trinket. */
export type CarriedItemSnapshot = {
  kind: PetItemKind;
  pickedUpAt: number;
  expiresAt: number;
};

export type MonitorWorkAreaSnapshot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorldViewportSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorldSnapshot = {
  width: number;
  height: number;
  /**
   * The clock reading this snapshot was taken at.
   *
   * Several fields here are absolute deadlines on the *simulation* clock —
   * `WorldItemSnapshot.expiresAt`, `CarriedItemSnapshot.expiresAt`,
   * expression and agent-channel expiry — and that clock is not wall time: a
   * world is stepped by a fixed slice per tick, so it drifts from `Date.now()`
   * and starts from zero. Without this reading a host holding a snapshot cannot
   * turn any of those deadlines into a duration, which is what a countdown is.
   *
   * Optional for the same reason `items` is: the physics world's own bare
   * snapshot has no clock behind it.
   */
  now?: number;
  viewport?: WorldViewportSnapshot;
  monitors?: MonitorWorkAreaSnapshot[];
  bodies: BodySnapshot[];
  pets: PetSnapshot[];
  climbableSurfaces: ClimbableSurfaceSnapshot[];
  /**
   * Trinkets currently lying on the desktop. Optional so the physics world's
   * own bare snapshot — and every host fixture built before trinkets existed —
   * still satisfies this type.
   */
  items?: WorldItemSnapshot[];
  /**
   * Props currently on the desktop. Optional for the same reason `items` is —
   * the physics world's own bare snapshot has no component store behind it.
   */
  props?: WorldPropSnapshot[];
};
