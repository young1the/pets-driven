import type { AgentTaskStatus } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import type {
  PetExpressionEmote,
  PetExpressionMood,
  PetExpressionSource,
} from "@pets-driven/pet-engine/core/components";
import type {
  AgentChannelSource,
  AgentChannelStatus,
} from "@pets-driven/pet-engine/features/agent/components";
import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
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
  status: AgentChannelStatus;
  label: string;
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
  isStatic?: boolean;
  animationState?: import("@pets-driven/pet-engine/pets/assets/pet-atlas").PetAnimationState;
  interaction?: InteractionSnapshot;
};

export type PetSnapshot = {
  id: string;
  sourceId: string;
  name: string;
  intent: string;
  locomotion: string;
  /** Current behavior/action overlay, separate from locomotion. */
  action?: string;
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
  /** The live social session this pet is in, or null when it is on its own. */
  social?: SocialSnapshot | null;
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
  viewport?: WorldViewportSnapshot;
  monitors?: MonitorWorkAreaSnapshot[];
  bodies: BodySnapshot[];
  pets: PetSnapshot[];
  climbableSurfaces: ClimbableSurfaceSnapshot[];
};
