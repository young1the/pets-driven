import { describe, expect, it } from "vitest";
import { isPetAsset } from "../../src/pets/assets/pet-asset";
import { isPetProfile } from "../../src/pets/profiles/pet-profile";
import playfulPreset from "../../src/pets/personalities/presets/playful.json";

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
        components: [{ type: "Talkative", idleAfterMs: 9000 }],
      }),
    ).toBe(true);
  });

  it("ships reusable presets rather than service-owned pet profiles", () => {
    expect(playfulPreset.id).toBe("playful");
    expect(playfulPreset.components.map((component) => component.type)).toContain("Curious");
    expect(playfulPreset).not.toHaveProperty("petAssetId");
  });
});
