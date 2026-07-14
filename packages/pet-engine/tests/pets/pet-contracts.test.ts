import { isPetAsset } from "@pets-driven/pet-engine/pets/assets/pet-asset";
import { createPlayfulPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";
import { isPetProfile } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { describe, expect, it } from "vitest";

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
      standForce: 0.0008,
      pursueForce: 0.0016,
      arriveForce: 0.002,
      idleConversationMs: 9000,
      completionIntent: "arrive",
      openness: 0.75,
      conscientiousness: 0.3,
      extraversion: 0.95,
      agreeableness: 0.55,
      neuroticism: 0.08,
    });
  });

  it("PetProfile stores personality as plain data, not components array", () => {
    const profile = { id: "my-jori", petAssetId: "jori", personality: createPlayfulPersonality() };
    expect("components" in profile).toBe(false);
    expect(typeof profile.personality).toBe("object");
    expect(Array.isArray(profile.personality)).toBe(false);
  });
});
