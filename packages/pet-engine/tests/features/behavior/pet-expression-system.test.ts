import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runPetExpressionExpirationSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

describe("runPetExpressionExpirationSystem", () => {
  it("keeps active expressions before expiry", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          {
            type: "PetExpressionState",
            source: "collision",
            mood: "confused",
            emote: "exclaim",
            label: "!",
            startedAt: 100,
            expiresAt: 700,
          },
        ],
      },
    ]);

    runPetExpressionExpirationSystem(store, createManualClock(699));

    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "collision",
      label: "!",
    });
  });

  it("removes expired expressions", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          {
            type: "PetExpressionState",
            source: "collision",
            mood: "confused",
            emote: "exclaim",
            label: "!",
            startedAt: 100,
            expiresAt: 700,
          },
        ],
      },
    ]);

    runPetExpressionExpirationSystem(store, createManualClock(700));

    expect(store.getComponent("pet", "PetExpressionState")).toBeUndefined();
  });
});
