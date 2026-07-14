import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import type {
  CursorSample,
  CursorStateComponent,
} from "@pets-driven/pet-engine/features/cursor/components";
import type { CursorPerception, PerceivedEntity } from "./components";

const MAX_PERCEPTION_RANGE = 400; // px

// Laser-pointer-chase tuning: cursor must be moving fast AND close to the pet.
const CURSOR_PLAYFUL_SPEED_PX_S = 600;
const CURSOR_PLAYFUL_RADIUS_PX = 300;
// Speed is smoothed over a short trailing window rather than the raw last two
// samples, which can be noisy at high tick rates.
const CURSOR_SPEED_MIN_WINDOW_MS = 40;
// If no fresh sample has landed recently, treat the cursor as stationary
// rather than replaying a stale burst of speed from old samples.
const CURSOR_STALE_MS = 300;

export function runPerceptionSystem(components: ComponentStore, now?: number): void {
  // Pass 1: collect world-wide entities once per tick
  let userAnchorEntry: { id: string; x: number; y: number } | null = null;
  components.forEach(["UserAnchor", "Transform"], (id, [, transform]) => {
    if (!userAnchorEntry) {
      userAnchorEntry = { id, x: transform.position.x, y: transform.position.y };
    }
  });

  // Singleton lookup — at most one CursorState exists (on "user-anchor").
  const cursorEntry: CursorStateComponent | null =
    components.components("CursorState").values().next().value ?? null;

  const climbables: { id: string; x: number; y: number }[] = [];
  components.forEach(["ClimbableSurface", "Transform"], (id, [, transform]) => {
    climbables.push({ id, x: transform.position.x, y: transform.position.y });
  });

  const allPets: { id: string; x: number; y: number }[] = [];
  components.forEach(["PetIdentity", "Transform"], (id, [, transform]) => {
    allPets.push({ id, x: transform.position.x, y: transform.position.y });
  });

  const effectiveNow = now ?? cursorEntry?.samples[cursorEntry.samples.length - 1]?.at ?? 0;
  const cursorSpeed = cursorEntry?.position
    ? computeCursorSpeed(cursorEntry.samples, effectiveNow)
    : 0;

  // Pass 2: write each pet's Perception
  components.forEach(
    ["Perception", "Transform", "Steering", "ContactState"],
    (id, [perception, transform, intentState, contact]) => {
      const px = transform.position.x;
      const py = transform.position.y;

      perception.userAnchor = userAnchorEntry
        ? buildEntry(userAnchorEntry.id, userAnchorEntry.x, userAnchorEntry.y, px, py)
        : null;

      perception.cursor = buildCursorPerception(cursorEntry, cursorSpeed, px, py);

      const nearbyPets: PerceivedEntity[] = [];
      for (const pet of allPets) {
        if (pet.id === id) continue;
        const entry = buildEntry(pet.id, pet.x, pet.y, px, py);
        if (entry.distance <= MAX_PERCEPTION_RANGE) {
          nearbyPets.push(entry);
        }
      }
      nearbyPets.sort((a, b) => a.distance - b.distance);
      perception.nearbyPets = nearbyPets;

      const nearbyClimbables: PerceivedEntity[] = [];
      for (const climbable of climbables) {
        const entry = buildEntry(climbable.id, climbable.x, climbable.y, px, py);
        if (entry.distance <= MAX_PERCEPTION_RANGE) {
          nearbyClimbables.push(entry);
        }
      }
      nearbyClimbables.sort((a, b) => a.distance - b.distance);
      perception.nearbyClimbables = nearbyClimbables;

      perception.self = {
        grounded: contact.grounded,
        climbing: !!components.getComponent(id, "ClimbingTag"),
        mode: intentState.mode,
      };
    },
  );
}

function buildEntry(id: string, ex: number, ey: number, px: number, py: number): PerceivedEntity {
  return {
    id,
    position: { x: ex, y: ey },
    distance: Math.hypot(ex - px, ey - py),
  };
}

function buildCursorPerception(
  cursorEntry: CursorStateComponent | null,
  cursorSpeed: number,
  px: number,
  py: number,
): CursorPerception | null {
  if (!cursorEntry?.position) return null;
  const distance = Math.hypot(cursorEntry.position.x - px, cursorEntry.position.y - py);
  const isPlayful =
    cursorSpeed >= CURSOR_PLAYFUL_SPEED_PX_S && distance <= CURSOR_PLAYFUL_RADIUS_PX;
  return {
    position: { ...cursorEntry.position },
    distance,
    speed: cursorSpeed,
    isPlayful,
  };
}

function computeCursorSpeed(samples: CursorSample[], now: number): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (now - last.at > CURSOR_STALE_MS) return 0;

  let reference = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    reference = samples[i];
    if (last.at - reference.at >= CURSOR_SPEED_MIN_WINDOW_MS) break;
  }

  const dt = last.at - reference.at;
  if (dt <= 0) return 0;
  const dist = Math.hypot(
    last.position.x - reference.position.x,
    last.position.y - reference.position.y,
  );
  return (dist / dt) * 1000;
}

export const PerceptionSystem: SimulationSystem<WorldStepContext> = {
  name: "PerceptionSystem",
  dependsOn: ["CursorInputSystem"],
  reads: [
    "UserAnchor",
    "Transform",
    "ClimbableSurface",
    "PetIdentity",
    "Perception",
    "Steering",
    "ContactState",
    "ClimbingTag",
    "CursorState",
  ],
  writes: ["Perception"],
  update(ctx) {
    runPerceptionSystem(ctx.components, ctx.clock.now());
  },
};
