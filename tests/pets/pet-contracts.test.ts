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
        personality: createPlayfulPersonality(),
      }),
    ).toBe(true);
  });

  it("personality factory returns plain data, not ECS component arrays", () => {
    const personality = createPlayfulPersonality();
    expect(Array.isArray(personality)).toBe(false);
    expect(personality).toEqual({
      idleSpeed: 0.0008,
      activeSpeed: 0.0016,
      seekSpeed: 0.002,
      idleConversationMs: 9000,
      completionIntent: "seek",
      curiosity: 0.7,
      sociability: 0.4,
      playfulness: 0.9,
      shyness: 0.1,
    });
  });

  it("PetProfile stores personality as plain data, not components array", () => {
    const profile = { id: "my-jori", petAssetId: "jori", personality: createPlayfulPersonality() };
    expect("components" in profile).toBe(false);
    expect(typeof profile.personality).toBe("object");
    expect(Array.isArray(profile.personality)).toBe(false);
  });
});
