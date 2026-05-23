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
};

export type PetSnapshot = {
  id: string;
  sourceId: string;
  name: string;
  intent: string;
  locomotion: string;
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
