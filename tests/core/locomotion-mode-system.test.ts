import { describe, expect, it } from "vitest";
import type { SimulationComponent, SimulationComponentType } from "@/core/components/simulation-components";
import { runLocomotionModeSystem } from "@/core/systems/locomotion-mode-system";

function createComponentRecorder() {
  const writes: Array<{ id: string; component: SimulationComponent }> = [];
  const removals: Array<{ id: string; type: SimulationComponentType }> = [];

  return {
    writes,
    removals,
    components: {
      setComponent(id: string, component: SimulationComponent) {
        writes.push({ id, component });
      },
      removeComponent(id: string, type: SimulationComponentType) {
        removals.push({ id, type });
      },
    },
  };
}

describe("locomotion mode system", () => {
  it("switches to climb by replacing active locomotion tags", () => {
    const entity = {
      id: "pet-a",
      walking: { type: "WalkingState" as const },
      climbing: null,
      flying: null,
      contact: {
        type: "ContactState" as const,
        grounded: true,
        climbableSurfaceId: "wall-1",
        climbableSurfacePosition: { x: 100, y: 100 },
      },
      wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
    };
    const recorder = createComponentRecorder();

    runLocomotionModeSystem([entity], recorder.components);

    expect(recorder.removals).toContainEqual({ id: "pet-a", type: "WalkingState" });
    expect(recorder.removals).toContainEqual({ id: "pet-a", type: "ClimbingState" });
    expect(recorder.removals).toContainEqual({ id: "pet-a", type: "FlyingState" });
    expect(recorder.writes).toContainEqual({
      id: "pet-a",
      component: { type: "ClimbingState" },
    });
  });

  it("does not switch to climb when entity has no CanWallClimb", () => {
    const recorder = createComponentRecorder();

    runLocomotionModeSystem(
      [
        {
          id: "pet-a",
          walking: { type: "WalkingState" as const },
          climbing: null,
          flying: null,
          contact: {
            type: "ContactState" as const,
            grounded: true,
            climbableSurfaceId: "wall-1",
            climbableSurfacePosition: { x: 100, y: 100 },
          },
          wallClimb: null,
        },
      ],
      recorder.components,
    );

    expect(recorder.writes).toEqual([]);
    expect(recorder.removals).toEqual([]);
  });

  it("does not switch to an unrelated climb surface while walking toward another target", () => {
    const recorder = createComponentRecorder();

    runLocomotionModeSystem(
      [
        {
          id: "pet-a",
          walking: { type: "WalkingState" as const },
          climbing: null,
          flying: null,
          contact: {
            type: "ContactState" as const,
            grounded: true,
            climbableSurfaceId: "wall-280",
            climbableSurfacePosition: { x: 280, y: 100 },
          },
          motion: {
            type: "MotionTarget" as const,
            targetEntityId: null as string | null,
            targetPosition: { x: 120, y: 120 } as { x: number; y: number } | null,
          },
          wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
        },
      ],
      recorder.components,
    );

    expect(recorder.writes).toEqual([]);
    expect(recorder.removals).toEqual([]);
  });

  it("switches to climb when the contacted surface matches the target x position", () => {
    const recorder = createComponentRecorder();

    runLocomotionModeSystem(
      [
        {
          id: "pet-a",
          walking: { type: "WalkingState" as const },
          climbing: null,
          flying: null,
          contact: {
            type: "ContactState" as const,
            grounded: true,
            climbableSurfaceId: "wall-120",
            climbableSurfacePosition: { x: 120, y: 500 },
          },
          motion: {
            type: "MotionTarget" as const,
            targetEntityId: null as string | null,
            targetPosition: { x: 120, y: 120 } as { x: number; y: number } | null,
          },
          wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
        },
      ],
      recorder.components,
    );

    expect(recorder.writes).toContainEqual({
      id: "pet-a",
      component: { type: "ClimbingState" },
    });
  });

  it("reverts to walk when surface is gone", () => {
    const recorder = createComponentRecorder();

    runLocomotionModeSystem(
      [
        {
          id: "pet-a",
          walking: null,
          climbing: { type: "ClimbingState" as const },
          flying: null,
          contact: {
            type: "ContactState" as const,
            grounded: false,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
        },
      ],
      recorder.components,
    );

    expect(recorder.writes).toContainEqual({
      id: "pet-a",
      component: { type: "WalkingState" },
    });
  });

  it("does not revert flying entities when there is no surface", () => {
    const recorder = createComponentRecorder();

    runLocomotionModeSystem(
      [
        {
          id: "pet-a",
          walking: null,
          climbing: null,
          flying: { type: "FlyingState" as const },
          contact: {
            type: "ContactState" as const,
            grounded: false,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          wallClimb: null,
        },
      ],
      recorder.components,
    );

    expect(recorder.writes).toEqual([]);
    expect(recorder.removals).toEqual([]);
  });

  it("does not re-enter climb while a climb dismount is airborne", () => {
    const recorder = createComponentRecorder();

    runLocomotionModeSystem(
      [
        {
          id: "pet-a",
          walking: { type: "WalkingState" as const },
          climbing: null,
          flying: null,
          contact: {
            type: "ContactState" as const,
            grounded: false,
            climbableSurfaceId: "wall-1",
            climbableSurfacePosition: { x: 100, y: 100 },
          },
          wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
          climbDismount: {
            type: "ClimbDismountState" as const,
            phase: "airborne" as const,
            cooldownMs: 0,
          },
        },
      ],
      recorder.components,
    );

    expect(recorder.writes).toEqual([]);
    expect(recorder.removals).toEqual([]);
  });

  it("does not re-enter climb while a climb dismount cooldown is active", () => {
    const recorder = createComponentRecorder();

    runLocomotionModeSystem(
      [
        {
          id: "pet-a",
          walking: { type: "WalkingState" as const },
          climbing: null,
          flying: null,
          contact: {
            type: "ContactState" as const,
            grounded: true,
            climbableSurfaceId: "wall-1",
            climbableSurfacePosition: { x: 100, y: 100 },
          },
          wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
          climbDismount: {
            type: "ClimbDismountState" as const,
            phase: "coolingDown" as const,
            cooldownMs: 500,
          },
        },
      ],
      recorder.components,
    );

    expect(recorder.writes).toEqual([]);
    expect(recorder.removals).toEqual([]);
  });
});
