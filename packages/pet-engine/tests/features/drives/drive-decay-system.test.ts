import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  clampDrive,
  driveResponseCurve,
  runDriveDecaySystem,
} from "@pets-driven/pet-engine/features/drives/systems";
import { describe, expect, it } from "vitest";

function makeStore(
  mode: "stand" | "pursue" | "arrive",
  drives?: Partial<{
    social: number;
    energy: number;
    curiosity: number;
  }>,
) {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "Steering", mode },
        {
          type: "Drives",
          social: 0.3,
          energy: 1,
          curiosity: 0.2,
          ...drives,
        },
      ],
    },
  ]);
}

describe("clampDrive", () => {
  it("clamps below 0 up to 0", () => {
    expect(clampDrive(-0.5)).toBe(0);
  });

  it("clamps above 1 down to 1", () => {
    expect(clampDrive(1.5)).toBe(1);
  });

  it("passes values already in range through unchanged", () => {
    expect(clampDrive(0.42)).toBe(0.42);
  });
});

describe("driveResponseCurve", () => {
  it("returns 0 at x=0 and 1 at x=1", () => {
    expect(driveResponseCurve(0)).toBe(0);
    expect(driveResponseCurve(1)).toBe(1);
  });

  it("is monotonically increasing", () => {
    const samples = [0, 0.2, 0.4, 0.6, 0.8, 1].map(driveResponseCurve);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });

  it("keeps low/mid drive pressure from dominating (sub-linear below ~0.7)", () => {
    // At x=0.5 a linear curve would return 0.5; the cubic response curve
    // should return noticeably less, so mid-range need doesn't already sway
    // decisions as strongly as a straight-line term would.
    expect(driveResponseCurve(0.5)).toBeLessThan(0.5);
  });

  it("rises sharply once the drive crosses the ~0.7-0.8 threshold", () => {
    const belowThreshold = driveResponseCurve(0.5);
    const atThreshold = driveResponseCurve(0.8);
    const nearMax = driveResponseCurve(1);
    // The jump from 0.5 -> 0.8 should be much larger than from 0 -> 0.5,
    // demonstrating the curve "dominates" past the threshold rather than
    // nudging scores linearly.
    expect(atThreshold - belowThreshold).toBeGreaterThan(belowThreshold);
    expect(nearMax).toBeCloseTo(1, 5);
  });

  it("clamps out-of-range inputs before curving", () => {
    expect(driveResponseCurve(-1)).toBe(0);
    expect(driveResponseCurve(2)).toBe(1);
  });
});

describe("runDriveDecaySystem", () => {
  it("raises social (loneliness) over time regardless of activity", () => {
    const store = makeStore("stand", { social: 0.3 });
    runDriveDecaySystem(store, 60_000);
    expect(store.getComponent("pet", "Drives")!.social).toBeGreaterThan(0.3);
  });

  it("drains energy while the pet is pursuing an active goal", () => {
    const store = makeStore("pursue", { energy: 1 });
    runDriveDecaySystem(store, 60_000);
    expect(store.getComponent("pet", "Drives")!.energy).toBeLessThan(1);
  });

  it("drains energy while seeking, same as active", () => {
    const store = makeStore("arrive", { energy: 1 });
    runDriveDecaySystem(store, 60_000);
    expect(store.getComponent("pet", "Drives")!.energy).toBeLessThan(1);
  });

  it("recovers energy while idle", () => {
    const store = makeStore("stand", { energy: 0.3 });
    runDriveDecaySystem(store, 60_000);
    expect(store.getComponent("pet", "Drives")!.energy).toBeGreaterThan(0.3);
  });

  it("raises curiosity while idle", () => {
    const store = makeStore("stand", { curiosity: 0.2 });
    runDriveDecaySystem(store, 60_000);
    expect(store.getComponent("pet", "Drives")!.curiosity).toBeGreaterThan(0.2);
  });

  it("does not raise curiosity while pursuing a goal", () => {
    const store = makeStore("pursue", { curiosity: 0.2 });
    runDriveDecaySystem(store, 60_000);
    expect(store.getComponent("pet", "Drives")!.curiosity).toBe(0.2);
  });

  it("clamps social at 1 even after a very long idle period", () => {
    const store = makeStore("stand", { social: 0.99 });
    runDriveDecaySystem(store, 10 * 60 * 1000);
    expect(store.getComponent("pet", "Drives")!.social).toBe(1);
  });

  it("clamps energy at 0 even after prolonged continuous activity", () => {
    const store = makeStore("pursue", { energy: 0.01 });
    runDriveDecaySystem(store, 10 * 60 * 1000);
    expect(store.getComponent("pet", "Drives")!.energy).toBe(0);
  });

  it("leaves entities without a Drives component untouched (no crash)", () => {
    const store = createComponentStore([
      { id: "pet", components: [{ type: "Steering", mode: "stand" }] },
    ]);
    expect(() => runDriveDecaySystem(store, 16)).not.toThrow();
    expect(store.getComponent("pet", "Drives")).toBeUndefined();
  });
});
