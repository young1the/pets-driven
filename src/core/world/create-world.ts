import type { ManualClock } from "@/shared/time/manual-clock";
import type { WorldEntity } from "../entities/world-entity";
import { createMatterPhysicsWorld } from "../physics/matter-physics-world";
import type { Stimulus } from "../stimuli/stimulus";
import { createStimulusQueue } from "../stimuli/stimulus-queue";
import { computeIntentSteeringForces } from "../systems/intent-steering-system";
import { runIdleConversationSystem } from "../systems/idle-conversation-system";
import { resolveMotionTargets } from "../systems/motion-target-system";
import { computeSeparationForces } from "../systems/separation-steering-system";
import { runStimulusReactionSystem } from "../systems/stimulus-reaction-system";
import { createSeededRandom, type RandomSource } from "@/shared/random/seeded-random";

export type RuntimePet = {
  id: string;
  sourceId: string;
  name: string;
  movement: {
    idleSpeed: number;
    activeSpeed: number;
    seekUserSpeed: number;
  };
  components: {
    Talkative?: { type: "Talkative"; idleAfterMs: number };
  };
  runtime: {
    lastActiveAt: number;
    speech: string | null;
    intent: string;
    motion: {
      targetEntityId: string | null;
      targetPosition: { x: number; y: number } | null;
    };
  };
};

export function createWorld(input: {
  width: number;
  height: number;
  clock: ManualClock;
  pets: RuntimePet[];
  entities: WorldEntity[];
  random?: RandomSource;
}) {
  const physics = createMatterPhysicsWorld({ width: input.width, height: input.height });
  const stimuli = createStimulusQueue();
  const random = input.random ?? createSeededRandom(1);

  for (const [index, pet] of input.pets.entries()) {
    physics.addCircle(pet.id, { x: 120 + index * 80, y: 200 }, 16);
  }

  return {
    getEntity(id: string) {
      return input.entities.find((entity) => entity.id === id);
    },
    getPet(id: string) {
      return input.pets.find((pet) => pet.id === id);
    },
    pushStimulus(stimulus: Stimulus) {
      stimuli.push(stimulus);
    },
    step(deltaMs: number) {
      runStimulusReactionSystem(input.pets, stimuli.drain());
      runIdleConversationSystem(input.pets, input.clock);
      const snapshot = physics.snapshot();
      resolveMotionTargets(input.pets, input.entities, random, {
        width: input.width,
        height: input.height,
      });
      const bodiesById = new Map(snapshot.bodies.map((body) => [body.id, body]));
      const intentForces = computeIntentSteeringForces(
        input.pets.map((pet) => ({
          id: pet.id,
          position: {
            x: bodiesById.get(pet.id)?.x ?? 0,
            y: bodiesById.get(pet.id)?.y ?? 0,
          },
          movement: pet.movement,
          runtime: pet.runtime,
        })),
      );
      const separationForces = computeSeparationForces(snapshot.bodies, 48);
      const forcesById = new Map<string, { x: number; y: number }>();

      for (const force of [...intentForces, ...separationForces]) {
        const previous = forcesById.get(force.id) ?? { x: 0, y: 0 };
        forcesById.set(force.id, {
          x: previous.x + force.x,
          y: previous.y + force.y,
        });
      }

      for (const [id, force] of forcesById) {
        physics.applyForce(id, force);
      }
      physics.step(deltaMs);
    },
    snapshot() {
      const physicsSnapshot = physics.snapshot();
      const bodiesById = new Map(physicsSnapshot.bodies.map((body) => [body.id, body]));

      return {
        ...physicsSnapshot,
        pets: input.pets.map((pet) => {
          const body = bodiesById.get(pet.id);

          return {
            id: pet.id,
            sourceId: pet.sourceId,
            name: pet.name,
            intent: pet.runtime.intent,
            speech: pet.runtime.speech,
            position: {
              x: body?.x ?? 0,
              y: body?.y ?? 0,
            },
          };
        }),
      };
    },
  };
}
