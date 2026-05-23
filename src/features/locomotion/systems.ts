import type { ComponentStore } from "@/core/component-store";
import type { SimulationComponentType } from "@/core/components";
import type { RandomSource } from "@/shared/random/seeded-random";

const CLIMB_TARGET_X_TOLERANCE = 24;
const ACTIVE_LOCOMOTION_TAGS: SimulationComponentType[] = [
  "WalkingState",
  "ClimbingState",
  "FlyingState",
];

export function runLocomotionModeSystem(components: ComponentStore): void {
  components.query(
    ["ContactState", "MotionTarget"],
    (id, [contact, motion]) => {
      const climbDismount = components.getComponent(id, "ClimbDismountState");
      if (climbDismount && climbDismount.phase !== "ready") {
        if (components.getComponent(id, "ClimbingState")) {
          switchLocomotion(id, "walk", components);
        }
        return;
      }

      const wallClimb = components.getComponent(id, "CanWallClimb");
      if (!wallClimb) return;

      const climbIntent = components.getComponent(id, "ClimbIntentState");
      const climbing = components.getComponent(id, "ClimbingState");

      if (canEnterClimb(contact, motion, climbIntent)) {
        switchLocomotion(id, "climb", components);
      } else if (climbing && !contact.climbableSurfaceId) {
        switchLocomotion(id, "walk", components);
      }
    },
  );
}

function canEnterClimb(
  contact: { climbableSurfaceId: string | null; climbableSurfacePosition: { x: number; y: number } | null },
  motion: { targetPosition: { x: number } | null },
  climbIntent: { surfaceEntityId: string } | undefined,
): boolean {
  if (!contact.climbableSurfaceId || !contact.climbableSurfacePosition) return false;
  if (climbIntent && contact.climbableSurfaceId !== climbIntent.surfaceEntityId) return false;
  if (!motion.targetPosition) return true;
  return (
    Math.abs(motion.targetPosition.x - contact.climbableSurfacePosition.x) <= CLIMB_TARGET_X_TOLERANCE
  );
}

function switchLocomotion(
  id: string,
  mode: "walk" | "climb" | "fly",
  components: ComponentStore,
) {
  for (const tag of ACTIVE_LOCOMOTION_TAGS) {
    components.removeComponent(id, tag);
  }
  if (mode === "walk") components.setComponent(id, { type: "WalkingState" });
  if (mode === "climb") components.setComponent(id, { type: "ClimbingState" });
  if (mode === "fly") components.setComponent(id, { type: "FlyingState" });
}

export function runLocomotionActiveStateSystem(components: ComponentStore): void {
  components.query(["ContactState"], (id, [contact]) => {
    const walking = components.getComponent(id, "WalkingState");
    const climbing = components.getComponent(id, "ClimbingState");
    const flying = components.getComponent(id, "FlyingState");
    const isAirborne = walking && !climbing && !flying && !contact.grounded;

    if (isAirborne) {
      components.setComponent(id, { type: "AirborneState" });
    } else {
      components.removeComponent(id, "AirborneState");
    }
  });
}

export function runMotionTargetSystem(
  components: ComponentStore,
  random: RandomSource,
  bounds: { width: number; height: number },
): void {
  type AnchorEntry = { id: string; x: number; y: number };
  const anchors: AnchorEntry[] = [];

  components.query(["Transform", "UserAnchor"], (id, [transform]) => {
    anchors.push({ id, x: transform.position.x, y: transform.position.y });
  });

  const anchor = anchors[0];

  components.query(["IntentState", "MotionTarget"], (_id, [intent, motion]) => {
    if (intent.intent === "seek") {
      motion.targetEntityId = anchor?.id ?? null;
      motion.targetPosition = anchor ? { x: anchor.x, y: anchor.y } : null;
      return;
    }

    if (!motion.targetPosition) {
      motion.targetEntityId = null;
      const margin = 48;
      motion.targetPosition = {
        x: margin + (bounds.width - margin * 2) * random.next(),
        y: margin + (bounds.height - margin * 2) * random.next(),
      };
    }
  });
}
