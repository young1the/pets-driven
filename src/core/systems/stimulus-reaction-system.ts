import { PET_SPEECH } from "@/core/constants/pet-speech";
import type { Stimulus } from "@/core/stimuli/stimulus";

type ReactivePet = {
  id: string;
  sourceId: string;
  runtime: {
    lastActiveAt?: number;
    intent: string;
    speech: string | null;
  };
};

export function runStimulusReactionSystem(pets: ReactivePet[], stimuli: Stimulus[]) {
  for (const stimulus of stimuli) {
    const pet = pets.find((candidate) => candidate.sourceId === stimulus.sourceId);
    if (!pet) {
      continue;
    }

    if (stimulus.type === "task.started") {
      pet.runtime.intent = "active";
      pet.runtime.speech = null;
      pet.runtime.lastActiveAt = stimulus.at;
    }

    if (stimulus.type === "task.waiting" || stimulus.type === "attention.requested") {
      pet.runtime.intent = "seek-user";
      pet.runtime.speech = stimulus.summary ?? PET_SPEECH.attentionNeeded;
    }

    if (stimulus.type === "task.completed") {
      pet.runtime.intent = "idle";
      pet.runtime.speech = stimulus.summary ?? null;
      pet.runtime.lastActiveAt = stimulus.at;
    }
  }
}
