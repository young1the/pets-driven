import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { QuietMode } from "@pets-driven/pet-engine/core/quiet-mode";
import { isChatterSilenced, isMovementStilled } from "@pets-driven/pet-engine/core/quiet-mode";
import { isChatterChannelSource } from "@pets-driven/pet-engine/features/agent/components";
import {
  stopPetMovement,
  type VelocityWriter,
} from "@pets-driven/pet-engine/features/behavior/claim";

/**
 * What Quiet Mode takes away, as two sweeps at the end of the phases that could
 * have put it there.
 */

/**
 * Silence companion chatter (level `quiet` and up).
 *
 * A sweep rather than a guard in each of the four places that speak: idle
 * chatter, a social session's lines, the answer to being petted, and the
 * hover reaction all write the same channel, and a fifth will be added by
 * someone who has never heard of this mode. Running last in BEHAVIOR — after
 * every one of them, and before the host takes its snapshot — means a line
 * silenced here was never on screen for even one frame, and that a new source
 * of chatter is covered the day it is written.
 *
 * Only chatter is dropped. An agent status keeps its channel, message and all:
 * a pet that stops reporting its task is not quiet, it is broken.
 */
export function runQuietChatterSystem(components: ComponentStore, mode: QuietMode): void {
  if (!isChatterSilenced(mode)) return;

  components.forEach(["AgentChannelState"], (id, [channel]) => {
    if (!isChatterChannelSource(channel.source)) return;
    components.removeComponent(id, "AgentChannelState");
  });
}

/**
 * Hold every pet where it stands (level `still`).
 *
 * The same two writes `TaskMovementHold` makes, for the same reason and in the
 * same phase slot: clear the motion target and zero the velocity before the
 * force systems can turn either into a step. `BehaviorDecisionSystem` has
 * already declined to pick anything new this tick, so this is what settles the
 * errands a pet was already on — a walk toward a trinket, a social session's
 * approach — without those systems needing to know the mode exists.
 *
 * Two pets are deliberately left alone: one the user is dragging, and one in
 * the air. Stillness is about the pet's own errands, not about the user's
 * hands — parking a thrown pet mid-flight would read as the app eating the
 * throw, and a pet that cannot fall is one standing on nothing.
 */
export function runQuietStillnessSystem(
  components: ComponentStore,
  physics: VelocityWriter,
  mode: QuietMode,
): void {
  if (!isMovementStilled(mode)) return;

  const dragged = draggedEntityId(components);

  components.forEach(["Personality", "MotionTarget"], (id) => {
    if (id === dragged) return;
    if (components.getComponent(id, "AirborneTag")) return;
    stopPetMovement(components, physics, id);
  });
}

/** The pet the user currently has hold of, if any. */
function draggedEntityId(components: ComponentStore): string | null {
  for (const drag of components.components("DragInteraction").values()) {
    return drag.entityId;
  }

  return null;
}
