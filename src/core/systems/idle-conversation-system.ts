import type {
  ActivityStateComponent,
  SpeechProfileComponent,
  SpeechStateComponent,
  TalkativeComponent,
} from "@/core/components/simulation-components";
import type { Clock } from "@/shared/time/manual-clock";

type TalkativePet = {
  talkative: TalkativeComponent;
  speechProfile: SpeechProfileComponent;
  activity: ActivityStateComponent;
  speech: SpeechStateComponent;
};

export function runIdleConversationSystem(pets: TalkativePet[], clock: Clock) {
  for (const pet of pets) {
    if (pet.speech.speech) {
      continue;
    }

    if (clock.now() - pet.activity.lastActiveAt >= pet.talkative.idleAfterMs) {
      pet.speech.speech = pet.speechProfile.idleCompanion;
    }
  }
}
