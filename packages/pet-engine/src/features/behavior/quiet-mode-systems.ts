import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { QuietMode } from "@pets-driven/pet-engine/core/quiet-mode";
import { isChatterSilenced } from "@pets-driven/pet-engine/core/quiet-mode";
import { isChatterChannelSource } from "@pets-driven/pet-engine/features/agent/components";
import {
  clearMotionTarget,
  type VelocityWriter,
} from "@pets-driven/pet-engine/features/behavior/claim";

/**
 * What Quiet Mode takes away: a chatter sweep at the end of BEHAVIOR and an
 * edge-triggered movement settlement when the world enters the still level.
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
 * Settle each pet once when the world enters Quiet Mode's still level.
 *
 * Existing errands are discarded immediately. A grounded pet also loses its
 * horizontal drift, but vertical velocity is never overwritten: gravity,
 * throws, and collision impulses remain physics concerns. Movement producers
 * keep the pet still after this edge by reading the world-level mode.
 *
 * Direct manipulation wins over the one-time horizontal settlement. Its
 * autonomous target is still discarded so it cannot resume a stale errand when
 * Quiet Mode is later disabled.
 */
export function applyQuietStillness(
  components: ComponentStore,
  physics: VelocityWriter,
  onlyEntityId?: string,
): void {
  const dragged = draggedEntityId(components);

  components.forEach(["PetIdentity"], (id) => {
    if (onlyEntityId && id !== onlyEntityId) return;
    clearMotionTarget(components, id);
    if (id === dragged) return;
    if (!components.getComponent(id, "ContactState")?.grounded) return;
    physics.setVelocity(id, { x: 0 });
  });
}

/** The pet the user currently has hold of, if any. */
function draggedEntityId(components: ComponentStore): string | null {
  for (const drag of components.components("DragInteraction").values()) {
    return drag.entityId;
  }

  return null;
}
