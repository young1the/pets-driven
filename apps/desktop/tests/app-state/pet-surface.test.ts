import { describe, expect, it } from "vitest";
import { selectAdoptedPetSimInputs } from "@/app-state/pet-surface";
import {
  createEmptyPetsDrivenState,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import { createPlayfulPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";

function stateWithPet(overrides: {
  id: string;
  archived?: boolean;
  visible?: boolean;
  personalityId?: "playful" | "attentive" | "reserved" | "curious" | "steady" | "bold";
  agentSourceId?: string;
}): PetsDrivenState {
  const base = createEmptyPetsDrivenState();

  return {
    ...base,
    pets: [
      {
        id: overrides.id,
        workingDirectoryId: overrides.agentSourceId ? "wd-1" : null,
        assetId: "bloop",
        profileId: `profile-${overrides.id}`,
        name: `Name ${overrides.id}`,
        adoptedAt: 0,
        archived: overrides.archived ?? false,
        visible: overrides.visible ?? true,
      },
    ],
    petProfiles: [
      {
        id: `profile-${overrides.id}`,
        petAssetId: "bloop",
        personalityId: overrides.personalityId ?? "playful",
        personality: createPlayfulPersonality(),
      },
    ],
    registeredWorkingDirectories: overrides.agentSourceId
      ? [
          {
            id: "wd-1",
            path: "D:\\code\\app",
            petId: overrides.id,
            agentSourceId: overrides.agentSourceId,
            createdAt: 0,
            updatedAt: 0,
          },
        ]
      : [],
  };
}

describe("selectAdoptedPetSimInputs", () => {
  it("maps a visible pet to a sim input with its source id and OCEAN personality", () => {
    const state = stateWithPet({
      id: "pet-1",
      personalityId: "reserved",
      agentSourceId: "agent-1",
    });

    expect(selectAdoptedPetSimInputs(state)).toEqual([
      {
        id: "pet-1",
        name: "Name pet-1",
        sourceId: "agent-1",
        personality: {
          type: "Personality",
          openness: 0.3,
          conscientiousness: 0.5,
          extraversion: 0.2,
          agreeableness: 0.4,
          neuroticism: 0.75,
        },
      },
    ]);
  });

  it("falls back to the pet id when no directory is linked yet", () => {
    const state = stateWithPet({ id: "pet-1" });

    expect(selectAdoptedPetSimInputs(state)[0].sourceId).toBe("pet-1");
  });

  it("maps the curious personality preset to its OCEAN component", () => {
    const state = stateWithPet({
      id: "pet-1",
      personalityId: "curious",
    });

    expect(selectAdoptedPetSimInputs(state)[0].personality).toEqual({
      type: "Personality",
      openness: 0.9,
      conscientiousness: 0.35,
      extraversion: 0.55,
      agreeableness: 0.6,
      neuroticism: 0.25,
    });
  });

  it("excludes archived and hidden pets", () => {
    const archived = stateWithPet({ id: "pet-1", archived: true });
    const hidden = stateWithPet({ id: "pet-2", visible: false });

    expect(selectAdoptedPetSimInputs(archived)).toEqual([]);
    expect(selectAdoptedPetSimInputs(hidden)).toEqual([]);
  });
});
