import { describe, expect, it } from "vitest";
import { petStatusFromSnapshot } from "@/app-state/pet-card-status";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

function snapshot(overrides: Partial<PetSnapshot>): PetSnapshot {
  return {
    id: "pet-1",
    sourceId: "agent-1",
    name: "Otto",
    intent: "wander",
    locomotion: "idle",
    speech: null,
    position: { x: 0, y: 0 },
    contact: { grounded: true, climbableSurfaceId: null },
    motionTarget: null,
    decision: null,
    pendingReaction: null,
    ...overrides,
  };
}

describe("petStatusFromSnapshot", () => {
  it("returns Idle/neutral when the pet is not in the live world", () => {
    expect(petStatusFromSnapshot(undefined)).toEqual({
      label: "Idle",
      tone: "neutral",
      dotColor: "var(--ink-300)",
    });
  });

  it("maps a waiting agent state to Needs you/warning", () => {
    expect(
      petStatusFromSnapshot(
        snapshot({
          heldAgentState: { kind: "waiting", label: "WAIT" },
        }),
      ),
    ).toEqual({
      label: "Needs you",
      tone: "warning",
      dotColor: "var(--butter-300)",
    });
  });

  it("maps a failed agent state to Needs you/danger", () => {
    expect(
      petStatusFromSnapshot(
        snapshot({ heldAgentState: { kind: "failed", label: "FAIL" } }),
      ),
    ).toEqual({
      label: "Needs you",
      tone: "danger",
      dotColor: "var(--coral-400)",
    });
  });

  it("maps a completed agent state to Done/success", () => {
    expect(
      petStatusFromSnapshot(
        snapshot({ heldAgentState: { kind: "completed", label: "DONE" } }),
      ),
    ).toEqual({
      label: "Done",
      tone: "success",
      dotColor: "var(--mint-300)",
    });
  });

  it("falls back to Working/info for an in-world pet with no held state", () => {
    expect(petStatusFromSnapshot(snapshot({}))).toEqual({
      label: "Working",
      tone: "info",
      dotColor: "var(--sky-300)",
    });
  });
});
