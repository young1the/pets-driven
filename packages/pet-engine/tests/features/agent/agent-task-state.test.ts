import {
  agentTaskBadgeLabel,
  statusFreezesMovement,
} from "@pets-driven/pet-engine/features/agent/agent-task-state";
import { describe, expect, it } from "vitest";

describe("statusFreezesMovement", () => {
  it("freezes only waiting, failed, completed", () => {
    expect(statusFreezesMovement("waiting")).toBe(true);
    expect(statusFreezesMovement("failed")).toBe(true);
    expect(statusFreezesMovement("completed")).toBe(true);
    expect(statusFreezesMovement("working")).toBe(false);
    expect(statusFreezesMovement("idle")).toBe(false);
  });
});

describe("agentTaskBadgeLabel", () => {
  it("maps held statuses to badge labels, none for working/idle", () => {
    expect(agentTaskBadgeLabel("waiting")).toBe("WAIT");
    expect(agentTaskBadgeLabel("failed")).toBe("FAIL");
    expect(agentTaskBadgeLabel("completed")).toBe("DONE");
    expect(agentTaskBadgeLabel("working")).toBeNull();
    expect(agentTaskBadgeLabel("idle")).toBeNull();
  });
});
