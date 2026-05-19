import type {
  ActivityStateComponent,
  AgentBindingComponent,
  CompletionBehaviorComponent,
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
  completionBehavior: CompletionBehaviorComponent;
};

export function runStimulusReactionSystem(pets: ReactivePet[], stimuli: Stimulus[]) {
  for (const stimulus of stimuli) {
    const pet = pets.find((candidate) => candidate.agent.sourceId === stimulus.sourceId);
    if (!pet) {
      continue;
    }

    if (stimulus.type === "task.started") {
      pet.intent.intent = "active";
      pet.speech.speech = stimulus.summary ?? pet.speechProfile.taskStarted;
      pet.activity.lastActiveAt = stimulus.at;
    }

    if (stimulus.type === "task.waiting" || stimulus.type === "attention.requested") {
      pet.intent.intent = "seek";
      pet.speech.speech = stimulus.summary ?? pet.speechProfile.attentionNeeded;
    }

    if (stimulus.type === "task.completed") {
      pet.intent.intent = pet.completionBehavior.intentAfterCompletion;
      pet.speech.speech = stimulus.summary ?? pet.speechProfile.taskCompleted;
      pet.activity.lastActiveAt = stimulus.at;
    }
  }
}
