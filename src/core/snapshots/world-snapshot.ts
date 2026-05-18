export type BodySnapshot = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  animationState?: import("../../pets/assets/pet-atlas").PetAnimationState;
};

export type WorldSnapshot = {
  width: number;
  height: number;
  bodies: BodySnapshot[];
};
