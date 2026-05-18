import type { ManualClock } from "../../shared/time/manual-clock";
import { createMatterPhysicsWorld } from "../physics/matter-physics-world";
import type { Stimulus } from "../stimuli/stimulus";
import { createStimulusQueue } from "../stimuli/stimulus-queue";
import { runIdleConversationSystem } from "../systems/idle-conversation-system";
import { runStimulusReactionSystem } from "../systems/stimulus-reaction-system";

export type RuntimePet = {
  id: string;
  sourceId: string;
  components: {
    Talkative?: { type: "Talkative"; idleAfterMs: number };
  };
  runtime: {
    lastActiveAt: number;
    speech: string | null;
    intent: string;
  };
};

export function createWorld(input: {
  width: number;
  height: number;
  clock: ManualClock;
  pets: RuntimePet[];
}) {
  const physics = createMatterPhysicsWorld({ width: input.width, height: input.height });
  const stimuli = createStimulusQueue();

  for (const [index, pet] of input.pets.entries()) {
    physics.addCircle(pet.id, { x: 120 + index * 80, y: 200 }, 16);
  }

  return {
    getPet(id: string) {
      return input.pets.find((pet) => pet.id === id);
    },
    pushStimulus(stimulus: Stimulus) {
      stimuli.push(stimulus);
    },
    step(deltaMs: number) {
      runStimulusReactionSystem(input.pets, stimuli.drain());
      runIdleConversationSystem(input.pets, input.clock);
      physics.step(deltaMs);
    },
    snapshot() {
      return physics.snapshot();
    },
  };
}
