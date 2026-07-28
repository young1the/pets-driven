import { createAdoptedPetsScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { DEFAULT_PET_CLIMB_VELOCITY } from "@pets-driven/pet-engine/pets/constants/pet-body";
import { describe, expect, it } from "vitest";
import { projectWorldSnapshotToPetWindows } from "@/pet-window/pet-window-projection";

/**
 * The last hop of a climb: simulation to the window the user actually sees.
 *
 * Every check on climbing so far reads the engine's own Transform, which proves
 * nothing about what is on screen — the pet's OS window is placed from the
 * projection, and a pet that climbs in the world but whose window stays put
 * looks exactly like a pet that never climbed.
 */

const MONITOR = { id: "monitor", x: 0, y: 0, width: 1920, height: 1032 };
const BOUNDS = { x: 0, y: 0, width: 1920, height: 1032 };
const STEP_MS = 16;
// The desktop's real body rect at scale 1 (PET_WINDOW_LAYOUT.body).
const DESKTOP_PET_BODY = { width: 156, height: 156 };

function windowYFor(projections: ReturnType<typeof projectWorldSnapshotToPetWindows>) {
  return projections[0]?.frame.window.y;
}

function climbingWorld() {
  return createAdoptedPetsScenario([{ id: "pet-a", sourceId: "agent-a", name: "Alice" }], {
    monitors: [MONITOR],
    petBodySize: DESKTOP_PET_BODY,
    spawnPoint: { x: 400, y: MONITOR.height - 100 },
  });
}

describe("a climbing pet's window", () => {
  it("rises up the screen as the pet climbs", () => {
    const { clock, world } = climbingWorld();

    for (let i = 0; i < 60; i += 1) {
      clock.advanceBy(STEP_MS);
      world.step(STEP_MS);
    }

    const groundedWindowY = windowYFor(
      projectWorldSnapshotToPetWindows(world.snapshot(), BOUNDS, 1),
    )!;

    world.setComponent("pet-a", {
      type: "CanWallClimb",
      velocity: DEFAULT_PET_CLIMB_VELOCITY,
    });

    let highestWindowY = groundedWindowY;
    let climbed = false;
    for (let i = 0; i < 90_000 / STEP_MS; i += 1) {
      clock.advanceBy(STEP_MS);
      world.step(STEP_MS);
      climbed ||= !!world.getComponent("pet-a", "ClimbingTag");
      const y = windowYFor(projectWorldSnapshotToPetWindows(world.snapshot(), BOUNDS, i + 2));
      if (y !== undefined) highestWindowY = Math.min(highestWindowY, y);
    }

    expect(climbed).toBe(true);
    // Not a hop: the window has to travel most of the screen, or the climb is
    // invisible to the user however well the simulation ran.
    expect(groundedWindowY - highestWindowY).toBeGreaterThan(MONITOR.height / 3);
  });
});
