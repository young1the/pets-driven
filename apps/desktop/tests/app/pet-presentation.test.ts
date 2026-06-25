import { describe, expect, it } from "vitest";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { personalityRoleLabel } from "@/app/pet-presentation";

describe("personalityRoleLabel", () => {
  it("returns the personality title", () => {
    expect(personalityRoleLabel("playful")).toBe("Playful");
    expect(personalityRoleLabel("steady")).toBe("Steady");
  });

  it("falls back to Pet for an unknown or missing personality", () => {
    expect(personalityRoleLabel(undefined)).toBe("Pet");
    expect(personalityRoleLabel("legacy" as PetPersonalityId)).toBe("Pet");
  });
});
