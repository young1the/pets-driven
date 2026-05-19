import type {
  ActivityStateComponent,
  AgentBindingComponent,
  IntentStateComponent,
  SpeechProfileComponent,
  SpeechStateComponent,
} from "@/core/components/simulation-components";
import type { Stimulus } from "@/core/stimuli/stimulus";

type ReactivePet = {
  id: string;
  agent: AgentBindingComponent;
  intent: IntentStateComponent;
  speechProfile: SpeechProfileComponent;
  speech: SpeechStateComponent;
  activity: ActivityStateComponent;
};

export function runStimulusReactionSystem(pets: ReactivePet[], stimuli: Stimulus[]) {
  for (const stimulus of stimuli) {
    const pet = pets.find((candidate) => candidate.agent.sourceId === stimulus.sourceId);
    if (!pet) {
      continue;
    }

    if (stimulus.type === "task.started") {
      pet.intent.intent = "active";
      pet.speech.speech = null;
      pet.activity.lastActiveAt = stimulus.at;
    }

    if (stimulus.type === "task.waiting" || stimulus.type === "attention.requested") {
      pet.intent.intent = "seek";
      pet.speech.speech = stimulus.summary ?? pet.speechProfile.attentionNeeded;
    }

    if (stimulus.type === "task.completed") {
      pet.intent.intent = "idle";
      pet.speech.speech = stimulus.summary ?? null;
      pet.activity.lastActiveAt = stimulus.at;
    }
  }
}
