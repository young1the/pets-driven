export type BodySnapshot = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

export type WorldSnapshot = {
  width: number;
  height: number;
  bodies: BodySnapshot[];
};
