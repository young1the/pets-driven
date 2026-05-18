export type BodySnapshot = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  animationState?: import("@/pets/assets/pet-atlas").PetAnimationState;
};

export type PetSnapshot = {
  id: string;
  sourceId: string;
  name: string;
  intent: string;
  speech: string | null;
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
};
