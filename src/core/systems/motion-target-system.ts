import type { WorldEntity } from "@/core/entities/world-entity";
import type { RandomSource } from "@/shared/random/seeded-random";

type MotionPet = {
  runtime: {
    intent: string;
    motion: {
      targetEntityId: string | null;
      targetPosition: { x: number; y: number } | null;
    };
  };
};

export function resolveMotionTargets(
  pets: MotionPet[],
  entities: WorldEntity[],
  random: RandomSource,
  bounds: { width: number; height: number },
) {
  for (const pet of pets) {
    if (pet.runtime.intent === "seek-user") {
      const anchor = entities.find((entity) => entity.kind === "user-anchor");
      pet.runtime.motion = {
        targetEntityId: anchor?.id ?? null,
        targetPosition: anchor?.position ?? null,
      };
      continue;
    }

    if (!pet.runtime.motion.targetPosition) {
      pet.runtime.motion = {
        targetEntityId: null,
        targetPosition: {
          x: bounds.width * random.next(),
          y: bounds.height * random.next(),
        },
      };
    }
  }
}
