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
  animationState?: import("@/pets/assets/pet-atlas").PetAnimationState;
  spriteFacing?: import("@/pets/assets/pet-atlas").PetSpriteFacing;
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
  /** Agent hook state held until the user interacts with this pet. */
  heldAgentState?: HeldAgentStateSnapshot | null;
  /** Presentation cue derived from current behavior, or null when quiet. */
  visualCue?: PetVisualCue | null;
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

export type HeldAgentStateSnapshot = {
  kind: "waiting" | "failed" | "completed";
  label: "WAIT" | "FAIL" | "DONE";
  summary?: string;
};

export type ClimbableSurfaceSnapshot = {
  id: string;
  position: {
    x: number;
    y: number;
  };
};

export type WorldSnapshot = {
  width: number;
  height: number;
  bodies: BodySnapshot[];
  pets: PetSnapshot[];
  climbableSurfaces: ClimbableSurfaceSnapshot[];
};
