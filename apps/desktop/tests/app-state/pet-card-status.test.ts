import { describe, expect, it } from "vitest";
import {
  petStatusFromSnapshot,
  createPetCardStatusTracker,
} from "@/app-state/pet-card-status";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

function snapshot(
  agentTask: PetSnapshot["agentTask"],
  overrides: Partial<PetSnapshot> = {},
): PetSnapshot {
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
    ...overrides,
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

  it("surfaces the engine activity for a working pet", () => {
    const status = petStatusFromSnapshot(
      snapshot({ status: "working", label: null }, { activity: "exploring" }),
    );
    expect(status.label).toBe("Exploring");
    expect(status.labelKey).toBe("exploring");
    expect(status.dotColor).toBe("var(--sky-300)");
  });

  it("surfaces the engine activity for an idle pet", () => {
    expect(
      petStatusFromSnapshot(snapshot(null, { activity: "headingOver" })).label,
    ).toBe("Heading over");
  });

  it("covers the cursor-play activities", () => {
    expect(
      petStatusFromSnapshot(snapshot(null, { activity: "chasingCursor" }))
        .label,
    ).toBe("Chasing the cursor");
    expect(
      petStatusFromSnapshot(snapshot(null, { activity: "beingPetted" })).label,
    ).toBe("Being petted");
  });

  it("keeps Needs you for waiting even with an activity", () => {
    expect(
      petStatusFromSnapshot(
        snapshot({ status: "waiting", label: "WAIT" }, { activity: "exploring" }),
      ).label,
    ).toBe("Needs you");
  });
});

describe("createPetCardStatusTracker", () => {
  const idle = petStatusFromSnapshot(snapshot(null));
  const exploring = petStatusFromSnapshot(
    snapshot(null, { activity: "exploring" }),
  );
  const hopping = petStatusFromSnapshot(snapshot(null, { activity: "hopping" }));
  const needsYou = petStatusFromSnapshot(
    snapshot({ status: "waiting", label: "WAIT" }),
  );

  it("upgrades from a base label to a behavior label immediately", () => {
    const tracker = createPetCardStatusTracker(1_500);
    expect(tracker.track("pet", idle, 0).labelKey).toBe("idle");
    expect(tracker.track("pet", exploring, 100).labelKey).toBe("exploring");
  });

  it("holds a behavior label against churn until minDisplayMs", () => {
    const tracker = createPetCardStatusTracker(1_500);
    tracker.track("pet", exploring, 0);
    // 500ms later the sim flips to hopping, then to idle — chip holds.
    expect(tracker.track("pet", hopping, 500).labelKey).toBe("exploring");
    expect(tracker.track("pet", idle, 1_000).labelKey).toBe("exploring");
    // After the hold expires the next value shows.
    expect(tracker.track("pet", hopping, 1_600).labelKey).toBe("hopping");
  });

  it("never delays a tone change (agent work state)", () => {
    const tracker = createPetCardStatusTracker(1_500);
    tracker.track("pet", exploring, 0);
    expect(tracker.track("pet", needsYou, 100).labelKey).toBe("needsYou");
  });

  it("tracks pets independently and can forget one", () => {
    const tracker = createPetCardStatusTracker(1_500);
    tracker.track("a", exploring, 0);
    expect(tracker.track("b", hopping, 0).labelKey).toBe("hopping");
    tracker.forget("a");
    // Fresh after forget: shows whatever comes next with no hold.
    expect(tracker.track("a", hopping, 100).labelKey).toBe("hopping");
  });
});
