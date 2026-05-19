import type {
  ActivityStateComponent,
  IdleConversationComponent,
  SpeechProfileComponent,
  SpeechStateComponent,
} from "@/core/components/simulation-components";
import type { Clock } from "@/shared/time/manual-clock";

type IdleConversationPet = {
  idleConversation: IdleConversationComponent;
  speechProfile: SpeechProfileComponent;
  activity: ActivityStateComponent;
  speech: SpeechStateComponent;
};

export function runIdleConversationSystem(pets: IdleConversationPet[], clock: Clock) {
  for (const pet of pets) {
    if (pet.speech.speech) {
      continue;
    }

    if (clock.now() - pet.activity.lastActiveAt >= pet.idleConversation.idleAfterMs) {
      pet.speech.speech = pet.speechProfile.idleCompanion;
    }
  }
}
