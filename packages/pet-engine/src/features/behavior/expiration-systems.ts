import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * Two bookkeeping systems that retire timed presentation state before the
 * tick's real decisions run: the spoken line on AgentChannelState and the
 * mood/emote cue on PetExpressionState.
 */

// The pet's spoken line lives on AgentChannelState.message. When its TTL lapses
// we clear the line; a plain utterance (no agent status) then has nothing left
// to show, so we drop the whole component and the pet falls quiet. An agent
// status (e.g. "working") keeps its shell so the capsule persists after the
// message fades. Freezing statuses carry a null expiry and never land here.
export function runAgentChannelMessageExpirationSystem(
  components: ComponentStore,
  clock: Clock,
): void {
  const now = clock.now();
  components.forEach(["AgentChannelState"], (id, [channel]) => {
    if (channel.expiresAt == null) return;
    if (channel.expiresAt > now) return;
    if (channel.status == null) {
      components.removeComponent(id, "AgentChannelState");
      return;
    }
    channel.message = null;
    channel.expiresAt = null;
  });
}

export function runPetExpressionExpirationSystem(components: ComponentStore, clock: Clock): void {
  const now = clock.now();
  components.forEach(["PetExpressionState"], (id, [expression]) => {
    if (expression.expiresAt > now) return;
    components.removeComponent(id, "PetExpressionState");
  });
}
