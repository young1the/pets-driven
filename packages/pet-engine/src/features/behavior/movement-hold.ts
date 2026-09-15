import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { isMovementStilled, type QuietMode } from "@pets-driven/pet-engine/core/quiet-mode";

/** Whether autonomous locomotion must not produce a new target, force, or impulse. */
export function isPetMovementHeld(
  components: ComponentStore,
  id: string,
  quietMode: QuietMode = "off",
): boolean {
  return isMovementStilled(quietMode) || !!components.getComponent(id, "TaskMovementHold");
}
