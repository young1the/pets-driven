import { describe, expect, it } from "vitest";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { personalityRoleLabelKey } from "@/app/pet-presentation";

describe("personalityRoleLabelKey", () => {
  it("returns the personality title key", () => {
    expect(personalityRoleLabelKey("playful")).toBe("personality.playful.title");
    expect(personalityRoleLabelKey("steady")).toBe("personality.steady.title");
  });

  it("falls back to the generic role key for an unknown or missing personality", () => {
    expect(personalityRoleLabelKey(undefined)).toBe("personality.role");
    expect(personalityRoleLabelKey("legacy" as PetPersonalityId)).toBe("personality.role");
  });
});
