import { describe, expect, it } from "vitest";
import { petStatusFromSnapshot } from "@/app-state/pet-card-status";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

function snapshot(agentTask: PetSnapshot["agentTask"]): PetSnapshot {
  return {
    id: "pet",
    sourceId: "agent-a",
    name: "Rex",
    intent: "idle",
    locomotion: "idle",
    speech: null,
    position: { x: 0, y: 0 },
    contact: { grounded: true, climbableSurfaceId: null },
    motionTarget: null,
    decision: null,
    pendingReaction: null,
    agentTask,
  };
}

describe("petStatusFromSnapshot", () => {
  it("no snapshot is Idle", () => {
    expect(petStatusFromSnapshot(undefined).label).toBe("Idle");
  });
  it("deployed but no agentTask is Idle (not Working)", () => {
    expect(petStatusFromSnapshot(snapshot(null)).label).toBe("Idle");
  });
  it("working agentTask is Working — the original bug fix", () => {
    expect(
      petStatusFromSnapshot(snapshot({ status: "working", label: null })).label,
    ).toBe("Working");
  });
  it("waiting/failed are Needs you; completed is Done", () => {
    expect(
      petStatusFromSnapshot(snapshot({ status: "waiting", label: "WAIT" }))
        .label,
    ).toBe("Needs you");
    expect(petStatusFromSnapshot(snapshot({ status: "failed", label: "FAIL" })).tone).toBe("danger");
    expect(
      petStatusFromSnapshot(snapshot({ status: "failed", label: "FAIL" }))
        .label,
    ).toBe("Needs you");
    expect(
      petStatusFromSnapshot(snapshot({ status: "completed", label: "DONE" }))
        .label,
    ).toBe("Done");
  });
});
