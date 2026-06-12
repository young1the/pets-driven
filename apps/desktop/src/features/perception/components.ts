import type { PetIntent } from "@/features/behavior/components";

export type PerceivedEntity = {
  id: string;
  position: { x: number; y: number };
  distance: number;
};

export type PerceptionComponent = {
  type: "Perception";
  userAnchor: PerceivedEntity | null;
  nearbyPets: PerceivedEntity[];
  nearbyClimbables: PerceivedEntity[];
  self: {
    grounded: boolean;
    climbing: boolean;
    intent: PetIntent;
  };
};
