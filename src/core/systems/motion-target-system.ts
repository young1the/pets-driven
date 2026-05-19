import type {
  IntentStateComponent,
  MotionTargetComponent,
  TransformComponent,
} from "@/core/components/simulation-components";
import type { RandomSource } from "@/shared/random/seeded-random";

type MotionPet = {
  intent: IntentStateComponent;
  motion: MotionTargetComponent;
};

type TargetEntity = {
  id: string;
  transform: TransformComponent;
};

export function runMotionTargetSystem(
  pets: MotionPet[],
  entities: TargetEntity[],
  random: RandomSource,
  bounds: { width: number; height: number },
) {
  for (const pet of pets) {
    if (pet.intent.intent === "seek") {
      const anchor = entities[0];
      pet.motion.targetEntityId = anchor?.id ?? null;
      pet.motion.targetPosition = anchor?.transform.position ?? null;
      continue;
    }

    if (!pet.motion.targetPosition) {
      pet.motion.targetEntityId = null;
      pet.motion.targetPosition = {
        x: bounds.width * random.next(),
        y: bounds.height * random.next(),
      };
    }
  }
}
