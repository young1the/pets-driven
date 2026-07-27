import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  claim,
  isClaimed,
  SPEECH_BUBBLE_DURATION_MS,
  setIdleSpeech,
} from "@pets-driven/pet-engine/features/behavior/claim";
import { IDLE_CONVERSATION_REASON } from "@pets-driven/pet-engine/features/behavior/components";
import { resolveSpeechVariant } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * Whether the pet is mid-agent-lifecycle: working, or holding a waiting /
 * failed / completed report the user has not acknowledged yet. Only a pet with
 * no live task (or none at all) counts as idle.
 */
function hasLiveAgentTask(components: ComponentStore, id: string): boolean {
  const status = components.getComponent(id, "AgentTaskState")?.status;
  return status !== undefined && status !== "idle";
}

// Priority 4: Autonomous idle behaviors (speech, wandering).
export function runAutonomousBehaviorSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource = createSeededRandom(1),
): void {
  const now = clock.now();

  // Idle conversation — only when no higher-priority claim holds
  components.forEach(
    ["IdleConversation", "SpeechProfile", "ActivityState"],
    (id, [idleConversation, speechProfile, activity]) => {
      if (isClaimed(components, id, "autonomous", now)) return;
      // Already saying something (social line, agent status, …)? Stay quiet.
      if (components.getComponent(id, "AgentChannelState")?.message) return;
      // A pet with a live agent task is not idle, and this is *idle* companion
      // chatter: its lines are ambient ("fancy a race?"), it claims over the
      // working pose for the bubble's whole life, and the resulting ambient
      // capsule made a busy pet read as one whose task had been released.
      // Work-lifecycle speech (task started, attention, acknowledge) is
      // unaffected — it rides the agent channel, not this system.
      if (hasLiveAgentTask(components, id)) return;
      if (clock.now() - activity.lastActiveAt >= idleConversation.idleAfterMs) {
        setIdleSpeech(
          components,
          id,
          resolveSpeechVariant(speechProfile.idleCompanion, random),
          now,
        );
        // Reset the idle timer so the *next* chatter is another full
        // idleAfterMs away. Without this, lastActiveAt stays frozen (it is only
        // otherwise bumped by agent events), the threshold remains crossed, and
        // the pet re-chatters every time this claim lapses (~1.5s) forever —
        // making idleConversationMs meaningless after the first utterance.
        activity.lastActiveAt = now;
        // Hold the claim for the bubble's whole lifetime, not the 500ms
        // autonomous default: otherwise the "chatting" activity flickers off
        // a second before the speech bubble it describes disappears.
        claim(
          components,
          id,
          "autonomous",
          now,
          IDLE_CONVERSATION_REASON,
          now + SPEECH_BUBBLE_DURATION_MS,
        );
      }
    },
  );
}
