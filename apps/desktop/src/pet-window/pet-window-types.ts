export type PetWindowPoint = {
  x: number;
  y: number;
};

export type PetWindowRect = PetWindowPoint & {
  width: number;
  height: number;
};

export type PetWindowHitLayout = {
  width: number;
  height: number;
  body: PetWindowRect;
  overlay?: PetWindowRect | null;
  resize?: PetWindowRect | null;
};

export type PetWindowHitKind = "body" | "overlay" | "resize" | "transparent";

export type PetWindowHitResult = {
  kind: PetWindowHitKind;
  startsDirectManipulation: boolean;
};

export type PetWindowRouteParams = {
  petId: string;
  assetId: string;
  windowIndex: number;
};
