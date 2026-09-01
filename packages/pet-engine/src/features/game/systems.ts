import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { isMovementStilled } from "@pets-driven/pet-engine/core/quiet-mode";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import { GAME_SESSION_ENTITY_ID } from "@pets-driven/pet-engine/features/game/components";

/**
 * Runs the opening countdown, and ends a session whose pet has left.
 *
 * The countdown is the only thing this step of the feature does with time, and
 * it is deliberately not a flourish: a course that simply starts moving gives
 * the user no moment to take the controls, and gives the pet no moment to be
 * seen being handed a course rather than wandering into one.
 *
 * A stilled world (Quiet Mode `still`) freezes the countdown where it is rather
 * than cancelling the session. The user asked the pets to hold still, not to
 * forget what they were doing — turning the mode off resumes the round.
 */
export function runGameSessionSystem(
  components: ComponentStore,
  deltaMs: number,
  stilled: boolean,
): void {
  const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
  if (!session?.petId) return;

  // The pet was sent home, or removed while it was on the course. A session
  // pointing at nothing is over; nothing else in the world has to know.
  if (!components.getComponent(session.petId, "PetIdentity")) {
    session.petId = null;
    session.phase = "over";
    return;
  }

  if (stilled) return;

  if (session.phase === "countdown") {
    session.countdownMs = Math.max(0, session.countdownMs - deltaMs);
    if (session.countdownMs === 0) {
      session.phase = "running";
    }
  }
}

export const GameSessionSystem: SimulationSystem<WorldStepContext> = {
  name: "GameSessionSystem",
  // After the agent's own events have landed, so a round that a later step ends
  // on a task result is reading this tick's task state and not the last one's.
  dependsOn: ["AgentTaskEventSystem"],
  reads: ["GameSession", "PetIdentity"],
  writes: ["GameSession"],
  update(ctx) {
    runGameSessionSystem(ctx.components, ctx.deltaMs, isMovementStilled(ctx.quietMode));
  },
};
