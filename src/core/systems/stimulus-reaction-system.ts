import type { Stimulus } from "../stimuli/stimulus";

type ReactivePet = {
  id: string;
  sourceId: string;
  runtime: {
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

    if (stimulus.type === "task.waiting" || stimulus.type === "attention.requested") {
      pet.runtime.intent = "seek-user";
      pet.runtime.speech = stimulus.summary ?? "I need you.";
    }
  }
}
