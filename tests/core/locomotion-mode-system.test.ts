import { describe, expect, it } from "vitest";
import { runLocomotionModeSystem } from "@/core/systems/locomotion-mode-system";

describe("locomotion mode system", () => {
  it("switches to climb when entity has CanWallClimb and is near a climbable surface", () => {
    const entity = {
      locomotion: {
        type: "LocomotionState" as const,
        baseMode: "walk" as const,
      },
      contact: {
        type: "ContactState" as const,
        grounded: true,
        climbableSurfaceId: "wall-1",
        climbableSurfacePosition: { x: 100, y: 100 },
      },
      wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
    };

    runLocomotionModeSystem([entity]);

    expect(entity.locomotion.baseMode).toBe("climb");
  });

  it("does not switch to climb when entity has no CanWallClimb", () => {
    const entity = {
      locomotion: {
        type: "LocomotionState" as const,
        baseMode: "walk" as const,
      },
      contact: {
        type: "ContactState" as const,
        grounded: true,
        climbableSurfaceId: "wall-1",
        climbableSurfacePosition: { x: 100, y: 100 },
      },
      wallClimb: null,
    };

    runLocomotionModeSystem([entity]);

    expect(entity.locomotion.baseMode).toBe("walk");
  });

  it("reverts to walk when surface is gone", () => {
    const entity = {
      locomotion: {
        type: "LocomotionState" as const,
        baseMode: "climb" as const,
      },
      contact: {
        type: "ContactState" as const,
        grounded: false,
        climbableSurfaceId: null,
        climbableSurfacePosition: null,
      },
      wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
    };

    runLocomotionModeSystem([entity]);

    expect(entity.locomotion.baseMode).toBe("walk");
  });

  it("does not revert fly mode when there is no surface", () => {
    const entity = {
      locomotion: {
        type: "LocomotionState" as const,
        baseMode: "fly" as const,
      },
      contact: {
        type: "ContactState" as const,
        grounded: false,
        climbableSurfaceId: null,
        climbableSurfacePosition: null,
      },
      wallClimb: null,
    };

    runLocomotionModeSystem([entity]);

    expect(entity.locomotion.baseMode).toBe("fly");
  });

  it("does not re-enter climb while a climb dismount is airborne", () => {
    const entity = {
      locomotion: {
        type: "LocomotionState" as const,
        baseMode: "walk" as const,
      },
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
    };

    runLocomotionModeSystem([entity]);

    expect(entity.locomotion.baseMode).toBe("walk");
  });

  it("does not re-enter climb while a climb dismount cooldown is active", () => {
    const entity = {
      locomotion: {
        type: "LocomotionState" as const,
        baseMode: "walk" as const,
      },
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
    };

    runLocomotionModeSystem([entity]);

    expect(entity.locomotion.baseMode).toBe("walk");
  });
});
