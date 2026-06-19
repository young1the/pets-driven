import { describe, expect, it } from "vitest";
import {
  adoptPet,
  getPetForWorkingDirectory,
  getWorkingDirectoryForPet,
  linkPetToWorkingDirectory,
} from "@/app-state/pet-adoption";
import {
  createEmptyPetsDrivenState,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import { createPlayfulPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";

function adopt(state: PetsDrivenState, id: string, assetId = "patamon") {
  return adoptPet(state, {
    id,
    profileId: `profile-${id}`,
    name: `Name ${id}`,
    assetId,
    personalityId: "playful",
    personality: createPlayfulPersonality(),
    now: 1234,
  });
}

function withDirectory(
  state: PetsDrivenState,
  id: string,
  petId = "",
): PetsDrivenState {
  return {
    ...state,
    registeredWorkingDirectories: [
      ...state.registeredWorkingDirectories,
      {
        id,
        path: `D:\\projects\\${id}`,
        petId,
        agentSourceId: `agent-${id}`,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  };
}

describe("adoptPet", () => {
  it("appends a pet record and its profile atomically", () => {
    const state = adopt(createEmptyPetsDrivenState(), "pet-1");

    expect(state.pets).toHaveLength(1);
    expect(state.pets[0]).toEqual({
      id: "pet-1",
      workingDirectoryId: null,
      assetId: "patamon",
      profileId: "profile-pet-1",
      name: "Name pet-1",
      adoptedAt: 1234,
      archived: false,
      visible: true,
    });
    expect(state.petProfiles[0]).toMatchObject({
      id: "profile-pet-1",
      petAssetId: "patamon",
      personalityId: "playful",
      personality: createPlayfulPersonality(),
    });
  });
});

describe("linkPetToWorkingDirectory", () => {
  it("links a pet and directory in both directions", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    state = withDirectory(state, "wd-1");

    const linked = linkPetToWorkingDirectory(state, "pet-1", "wd-1");

    expect(getWorkingDirectoryForPet(linked, "pet-1")?.id).toBe("wd-1");
    expect(getPetForWorkingDirectory(linked, "wd-1")?.id).toBe("pet-1");
    expect(linked.pets[0].workingDirectoryId).toBe("wd-1");
  });

  it("steals the directory from a previously linked pet", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    state = adopt(state, "pet-2", "agumon");
    state = withDirectory(state, "wd-1");
    state = linkPetToWorkingDirectory(state, "pet-1", "wd-1");

    const stolen = linkPetToWorkingDirectory(state, "pet-2", "wd-1");

    expect(stolen.pets.find((pet) => pet.id === "pet-1")?.workingDirectoryId)
      .toBeNull();
    expect(stolen.pets.find((pet) => pet.id === "pet-2")?.workingDirectoryId)
      .toBe("wd-1");
    expect(getPetForWorkingDirectory(stolen, "wd-1")?.id).toBe("pet-2");
  });

  it("moves a pet between directories, freeing the old one", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    state = withDirectory(state, "wd-1");
    state = withDirectory(state, "wd-2");
    state = linkPetToWorkingDirectory(state, "pet-1", "wd-1");

    const moved = linkPetToWorkingDirectory(state, "pet-1", "wd-2");

    expect(moved.pets[0].workingDirectoryId).toBe("wd-2");
    expect(
      moved.registeredWorkingDirectories.find((wd) => wd.id === "wd-2")?.petId,
    ).toBe("pet-1");
  });

  it("returns state unchanged when pet or directory is missing", () => {
    const state = adopt(createEmptyPetsDrivenState(), "pet-1");

    expect(linkPetToWorkingDirectory(state, "pet-1", "wd-missing")).toBe(state);
    expect(linkPetToWorkingDirectory(state, "pet-missing", "wd-1")).toBe(state);
  });
});
