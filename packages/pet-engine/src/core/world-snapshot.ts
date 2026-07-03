import type { AgentTaskStatus } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import type {
  PetExpressionEmote,
  PetExpressionMood,
} from "@pets-driven/pet-engine/core/components";
import type {
  AgentChannelSource,
  AgentChannelStatus,
} from "@pets-driven/pet-engine/features/agent/components";

export type PetExpressionSnapshot = {
  source: "collision";
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
  spriteFacing?: import("@pets-driven/pet-engine/pets/assets/pet-atlas").PetSpriteFacing;
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
};

export type InteractionSnapshot = {
  controllable?: boolean;
  selected?: boolean;
  dragged?: boolean;
  controlled?: boolean;
  scale?: number;
};

export type PetVisualCue = {
  kind: "affection" | "flee" | "wander" | "surprised";
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
