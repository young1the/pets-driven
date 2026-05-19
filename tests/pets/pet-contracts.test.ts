import { describe, expect, it } from "vitest";
import { isPetAsset } from "@/pets/assets/pet-asset";
import { createPlayfulPersonality } from "@/pets/personalities/factories";
import { isPetProfile } from "@/pets/profiles/pet-profile";

describe("pet contracts", () => {
  it("accepts the external hatch-pet manifest shape", () => {
    expect(
      isPetAsset({
        id: "jori",
        displayName: "Jori",
        description: "A tiny helper.",
        spritesheetPath: "spritesheet.webp",
      }),
    ).toBe(true);
  });

  it("keeps user profiles separate from external pet assets", () => {
    expect(
      isPetProfile({
        id: "my-jori",
        petAssetId: "jori",
        components: [{ type: "IdleConversation", idleAfterMs: 9000 }],
      }),
    ).toBe(true);
  });

  it("builds reusable personalities as simulation component factories", () => {
    expect(createPlayfulPersonality()).toEqual([
      {
        type: "MovementProfile",
        idleSpeed: 0.0008,
        activeSpeed: 0.0016,
        seekSpeed: 0.002,
      },
      { type: "IdleConversation", idleAfterMs: 9000 },
      {
        type: "CompletionBehavior",
        intentAfterCompletion: "seek",
      },
    ]);
  });
});
