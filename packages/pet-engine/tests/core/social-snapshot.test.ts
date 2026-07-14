import { createWorld } from "@pets-driven/pet-engine/core/create-world";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

function pet(id: string, name: string, x: number) {
  return {
    id,
    components: [
      { type: "PetIdentity" as const, name },
      { type: "AgentBinding" as const, sourceId: id },
      { type: "Steering" as const, mode: "stand" as const },
      { type: "Transform" as const, position: { x, y: 500 } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        width: 32,
        height: 38,
      },
    ],
  };
}

describe("social snapshot", () => {
  it("resolves the partner's display name into each member's social snapshot", () => {
    const clock = createManualClock(0);
    const world = createWorld({
      width: 960,
      height: 540,
      clock,
      entities: [
        pet("pet-a", "Alice", 100),
        pet("pet-b", "Bob", 140),
        {
          id: "sess",
          components: [
            {
              type: "SocialSession" as const,
              kind: "chat" as const,
              participantIds: ["pet-a", "pet-b"],
              phase: "play" as const,
              startedAt: 0,
              endsAt: 20_000,
              playStartedAt: 0,
              greeted: true,
            },
          ],
        },
      ],
    });
    world.setComponent("pet-a", {
      type: "SocialSessionMember",
      sessionId: "sess",
      partnerId: "pet-b",
      role: "initiator",
    });
    world.setComponent("pet-b", {
      type: "SocialSessionMember",
      sessionId: "sess",
      partnerId: "pet-a",
      role: "responder",
    });

    const pets = world.snapshot().pets;
    const a = pets.find((p) => p.id === "pet-a");
    const b = pets.find((p) => p.id === "pet-b");

    expect(a?.social).toMatchObject({
      kind: "chat",
      role: "initiator",
      partnerId: "pet-b",
      partnerName: "Bob",
    });
    expect(b?.social?.partnerName).toBe("Alice");
  });

  it("reports null social for a pet not in a session", () => {
    const clock = createManualClock(0);
    const world = createWorld({
      width: 960,
      height: 540,
      clock,
      entities: [pet("pet-a", "Alice", 100)],
    });

    expect(world.snapshot().pets[0].social).toBeNull();
  });
});
