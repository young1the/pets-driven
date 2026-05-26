import type { ComponentStore } from "@/core/component-store";
import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import type { PerceivedEntity } from "./components";

const MAX_PERCEPTION_RANGE = 400; // px

export function runPerceptionSystem(components: ComponentStore): void {
  // Pass 1: collect world-wide entities once per tick
  let userAnchorEntry: { id: string; x: number; y: number } | null = null;
  components.forEach(["UserAnchor", "Transform"], (id, [, transform]) => {
    if (!userAnchorEntry) {
      userAnchorEntry = { id, x: transform.position.x, y: transform.position.y };
    }
  });

  const climbables: { id: string; x: number; y: number }[] = [];
  components.forEach(["ClimbableSurface", "Transform"], (id, [, transform]) => {
    climbables.push({ id, x: transform.position.x, y: transform.position.y });
  });

  const allPets: { id: string; x: number; y: number }[] = [];
  components.forEach(["PetIdentity", "Transform"], (id, [, transform]) => {
    allPets.push({ id, x: transform.position.x, y: transform.position.y });
  });

  // Pass 2: write each pet's Perception
  components.forEach(
    ["Perception", "Transform", "IntentState", "ContactState"],
    (id, [perception, transform, intentState, contact]) => {
      const px = transform.position.x;
      const py = transform.position.y;

      perception.userAnchor = userAnchorEntry
        ? buildEntry(userAnchorEntry.id, userAnchorEntry.x, userAnchorEntry.y, px, py)
        : null;

      perception.nearbyPets = allPets
        .filter((p) => p.id !== id)
        .map((p) => buildEntry(p.id, p.x, p.y, px, py))
        .filter((e) => e.distance <= MAX_PERCEPTION_RANGE)
        .sort((a, b) => a.distance - b.distance);

      perception.nearbyClimbables = climbables
        .map((c) => buildEntry(c.id, c.x, c.y, px, py))
        .filter((e) => e.distance <= MAX_PERCEPTION_RANGE)
        .sort((a, b) => a.distance - b.distance);

      perception.self = {
        grounded: contact.grounded,
        climbing: !!components.getComponent(id, "ClimbingTag"),
        intent: intentState.intent,
      };
    },
  );
}

function buildEntry(
  id: string,
  ex: number,
  ey: number,
  px: number,
  py: number,
): PerceivedEntity {
  return {
    id,
    position: { x: ex, y: ey },
    distance: Math.hypot(ex - px, ey - py),
  };
}

export const PerceptionSystem: SimulationSystem<WorldStepContext> = {
  name: "PerceptionSystem",
  dependsOn: ["ContactSystem"],
  reads: [
    "UserAnchor",
    "Transform",
    "ClimbableSurface",
    "PetIdentity",
    "Perception",
    "IntentState",
    "ContactState",
    "ClimbingTag",
  ],
  writes: ["Perception"],
  update(ctx) {
    runPerceptionSystem(ctx.components);
  },
};
