import type { ComponentStore } from "@/core/component-store";
import type { Stimulus } from "./stimulus";
import type { Clock } from "@/shared/time/manual-clock";

export function runStimulusReactionSystem(
  components: ComponentStore,
  stimuli: Stimulus[],
): void {
  if (stimuli.length === 0) return;

  components.query(
    ["AgentBinding", "IntentState", "SpeechProfile", "SpeechState", "ActivityState", "CompletionBehavior"],
    (_id, [agent, intent, speechProfile, speech, activity, completionBehavior]) => {
      for (const stimulus of stimuli) {
        if (agent.sourceId !== stimulus.sourceId) continue;

        if (stimulus.type === "task.started") {
          intent.intent = "active";
          speech.speech = stimulus.summary ?? speechProfile.taskStarted;
          activity.lastActiveAt = stimulus.at;
        }

        if (stimulus.type === "task.waiting" || stimulus.type === "attention.requested") {
          intent.intent = "seek";
          speech.speech = stimulus.summary ?? speechProfile.attentionNeeded;
        }

        if (stimulus.type === "task.completed") {
          intent.intent = completionBehavior.intentAfterCompletion;
          speech.speech = stimulus.summary ?? speechProfile.taskCompleted;
          activity.lastActiveAt = stimulus.at;
        }
      }
    },
  );
}

export function runIdleConversationSystem(
  components: ComponentStore,
  clock: Clock,
): void {
  components.query(
    ["IdleConversation", "SpeechProfile", "SpeechState", "ActivityState"],
    (_id, [idleConversation, speechProfile, speech, activity]) => {
      if (speech.speech) return;
      if (clock.now() - activity.lastActiveAt >= idleConversation.idleAfterMs) {
        speech.speech = speechProfile.idleCompanion;
      }
    },
  );
}
