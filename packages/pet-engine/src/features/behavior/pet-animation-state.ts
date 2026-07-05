import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";

// Horizontal speed above this (matter.js units, matching the vertical jump
// threshold) counts as the pet visibly travelling, so it plays a directional
// running row instead of the stationary task-run animation.
const TRAVEL_SPEED_THRESHOLD = 0.5;

type TravelDirection = "left" | "right";

function getTravelDirection(body: { vx: number }): TravelDirection | null {
  if (Math.abs(body.vx) <= TRAVEL_SPEED_THRESHOLD) {
    return null;
  }
  return body.vx > 0 ? "right" : "left";
}

/**
 * Canonical "intent → sprite row" mapping. Reads the pet's ECS state and picks
 * one of the atlas's animation rows. This is where the vocabulary of pet
 * intents lives: as the behavior surface grows, new intents resolve to a row
 * here, while the rendering layer stays a pure function of the row.
 */
export function getPetAnimationState(
  componentStore: ComponentStore,
  id: string,
  body: { vx: number; vy: number },
): PetAnimationState | undefined {
  if (!componentStore.getComponent(id, "PetIdentity")) {
    return undefined;
  }

  const agentTask = componentStore.getComponent(id, "AgentTaskState");

  // Status poses (waiting / failed / review) only apply while the pet is
  // actually held. Once the user releases the hold, the reported status
  // stays on the pet but locomotion drives the sprite again.
  if (componentStore.getComponent(id, "TaskMovementHold")) {
    if (agentTask?.status === "failed") return "failed";
    if (agentTask?.status === "completed") return "review";
    if (agentTask?.status === "waiting") return "waiting";

    const decision = componentStore.getComponent(id, "BehaviorDecisionState");
    if (decision?.reason === "task.failed") return "failed";
    if (decision?.reason === "task.completed") return "review";
    if (
      decision?.reason === "task.waiting" ||
      decision?.reason === "attention.requested"
    ) {
      return "waiting";
    }
  }

  const jumpAction = componentStore.getComponent(id, "JumpActionState");
  if (
    jumpAction ||
    componentStore.getComponent(id, "AirborneTag") ||
    Math.abs(body.vy) > 0.5
  ) {
    return "jumping";
  }

  // System-driven horizontal movement plays the directional travel rows. Read
  // the pet's actual horizontal velocity so every kind of system push —
  // walking toward a target, fleeing, collision recoil, coasting momentum —
  // reads as travel, rather than falling through to the stationary task-run
  // ("running") sprite that does not look like it is moving.
  const travelDirection = getTravelDirection(body);
  if (travelDirection) {
    return travelDirection === "right" ? "running-right" : "running-left";
  }

  const intent = componentStore.getComponent(id, "IntentState");
  if (intent?.intent === "active") {
    return "running";
  }

  return agentTask?.status === "working" ? "running" : "idle";
}
