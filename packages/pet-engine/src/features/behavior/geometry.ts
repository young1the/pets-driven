import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Vector } from "@pets-driven/pet-engine/features/physics/components";

/**
 * Positional helpers shared by every behavior system that places a pet: bounds
 * clamping, unit vectors, and the body width most distances are expressed in.
 */

export const DEFAULT_BEHAVIOR_BODY_WIDTH = 32;

/** Keep placed targets this far inside the screen bounds. */
export const COLLISION_TARGET_MARGIN = 48;

export function normalize(v: Vector): Vector {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampToBoundsX(
  value: number,
  bounds: { x?: number; width: number },
  margin: number,
) {
  const min = (bounds.x ?? 0) + margin;
  const max = (bounds.x ?? 0) + bounds.width - margin;
  return clamp(value, min, max);
}

export function clampToBoundsY(
  value: number,
  bounds: { y?: number; height: number },
  margin: number,
) {
  const min = (bounds.y ?? 0) + margin;
  const max = (bounds.y ?? 0) + bounds.height - margin;
  return clamp(value, min, max);
}

export function petWidth(components: ComponentStore, id: string): number {
  return components.getComponent(id, "PhysicsBody")?.width ?? DEFAULT_BEHAVIOR_BODY_WIDTH;
}
