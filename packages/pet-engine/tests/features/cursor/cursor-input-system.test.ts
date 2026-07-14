import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runCursorInputSystem } from "@pets-driven/pet-engine/features/cursor/systems";
import { describe, expect, it } from "vitest";

describe("CursorInputSystem", () => {
  it("creates CursorState from the first CursorInput and syncs the Transform", () => {
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 480, y: 500 } },
          { type: "CursorInput", position: { x: 640, y: 360 }, at: 16 },
        ],
      },
    ]);

    runCursorInputSystem(store);

    const state = store.getComponent("user-anchor", "CursorState");
    expect(state?.position).toEqual({ x: 640, y: 360 });
    expect(state?.samples).toEqual([{ at: 16, position: { x: 640, y: 360 } }]);
    expect(store.getComponent("user-anchor", "Transform")?.position).toEqual({
      x: 640,
      y: 360,
    });
    // Transient input is consumed.
    expect(store.getComponent("user-anchor", "CursorInput")).toBeUndefined();
  });

  it("appends successive samples to the existing ring buffer", () => {
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 480, y: 500 } },
          {
            type: "CursorState",
            position: { x: 100, y: 100 },
            samples: [{ at: 0, position: { x: 100, y: 100 } }],
          },
        ],
      },
    ]);

    store.setComponent("user-anchor", {
      type: "CursorInput",
      position: { x: 120, y: 100 },
      at: 16,
    });
    runCursorInputSystem(store);

    const state = store.getComponent("user-anchor", "CursorState");
    expect(state?.samples).toEqual([
      { at: 0, position: { x: 100, y: 100 } },
      { at: 16, position: { x: 120, y: 100 } },
    ]);
  });

  it("ignores an input timestamp that is not newer than the last sample", () => {
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 480, y: 500 } },
          {
            type: "CursorState",
            position: { x: 100, y: 100 },
            samples: [{ at: 100, position: { x: 100, y: 100 } }],
          },
        ],
      },
    ]);

    store.setComponent("user-anchor", {
      type: "CursorInput",
      position: { x: 999, y: 999 },
      at: 50, // older than the last recorded sample
    });
    runCursorInputSystem(store);

    const state = store.getComponent("user-anchor", "CursorState");
    expect(state?.samples).toHaveLength(1);
    expect(state?.samples[0]).toEqual({ at: 100, position: { x: 100, y: 100 } });
    // Position still reflects the latest feed (host is the source of truth
    // for "current" position even if the sample wasn't appended).
    expect(state?.position).toEqual({ x: 999, y: 999 });
  });

  it("trims samples older than the retention window", () => {
    const oldSamples = Array.from({ length: 5 }, (_, i) => ({
      at: i * 10,
      position: { x: i, y: 0 },
    }));
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "CursorState", position: { x: 4, y: 0 }, samples: oldSamples },
        ],
      },
    ]);

    store.setComponent("user-anchor", {
      type: "CursorInput",
      position: { x: 50, y: 0 },
      at: 10_000, // far beyond the 2s retention window
    });
    runCursorInputSystem(store);

    const state = store.getComponent("user-anchor", "CursorState");
    // All of the old samples (at <= 40) fall outside the [10000-2000, 10000]
    // window, leaving only the freshly appended one.
    expect(state?.samples).toEqual([{ at: 10_000, position: { x: 50, y: 0 } }]);
  });
});
