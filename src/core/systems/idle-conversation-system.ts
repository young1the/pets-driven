import { PET_SPEECH } from "@/core/constants/pet-speech";
import type { Clock } from "@/shared/time/manual-clock";

type TalkativePet = {
  components: {
    Talkative?: { type: "Talkative"; idleAfterMs: number };
  };
  runtime: {
    lastActiveAt: number;
    speech: string | null;
    intent: string;
  };
};

export function runIdleConversationSystem(pets: TalkativePet[], clock: Clock) {
  for (const pet of pets) {
    const talkative = pet.components.Talkative;
    if (!talkative || pet.runtime.speech) {
      continue;
    }

    if (clock.now() - pet.runtime.lastActiveAt >= talkative.idleAfterMs) {
      pet.runtime.speech = PET_SPEECH.idleCompanion;
    }
  }
}
