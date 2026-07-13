import { describe, expect, it } from "vitest";
import {
  adoptPet,
  clearWorkingDirectoryForPet,
  getPetForWorkingDirectory,
  getWorkingDirectoryForPet,
  linkPetToWorkingDirectory,
  registerWorkingDirectory,
  removePet,
} from "@/app-state/pet-adoption";
import {
  createEmptyPetsDrivenState,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import { createPlayfulPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";

function adopt(state: PetsDrivenState, id: string, assetId = "bloop") {
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
      assetId: "bloop",
      profileId: "profile-pet-1",
      name: "Name pet-1",
      adoptedAt: 1234,
      archived: false,
      visible: true,
    });
    expect(state.petProfiles[0]).toMatchObject({
      id: "profile-pet-1",
      petAssetId: "bloop",
      personalityId: "playful",
      personality: createPlayfulPersonality(),
    });
  });
});

describe("removePet", () => {
  it("removes the pet, its profile, and its linked working directory", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    state = adopt(state, "pet-2", "cato");
    const linked = registerWorkingDirectory(state, {
      petId: "pet-1",
      path: "D:\\code\\one",
      workingDirectoryId: "wd-1",
      agentSourceId: "agent-1",
      now: 99,
    });
    if (linked.status === "linked") state = linked.state;

    const next = removePet(state, "pet-1");

    expect(next.pets.map((pet) => pet.id)).toEqual(["pet-2"]);
    expect(next.petProfiles.map((profile) => profile.id)).toEqual([
      "profile-pet-2",
    ]);
    expect(next.registeredWorkingDirectories).toHaveLength(0);
  });

  it("leaves other pets' directories intact", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    state = adopt(state, "pet-2", "cato");
    const first = registerWorkingDirectory(state, {
      petId: "pet-1",
      path: "D:\\code\\one",
      workingDirectoryId: "wd-1",
      agentSourceId: "agent-1",
      now: 99,
    });
    if (first.status === "linked") state = first.state;
    const second = registerWorkingDirectory(state, {
      petId: "pet-2",
      path: "D:\\code\\two",
      workingDirectoryId: "wd-2",
      agentSourceId: "agent-2",
      now: 99,
    });
    if (second.status === "linked") state = second.state;

    const next = removePet(state, "pet-1");

    expect(next.registeredWorkingDirectories.map((wd) => wd.petId)).toEqual([
      "pet-2",
    ]);
  });

  it("returns state unchanged when the pet is missing", () => {
    const state = adopt(createEmptyPetsDrivenState(), "pet-1");

    expect(removePet(state, "pet-missing")).toBe(state);
  });
});

describe("clearWorkingDirectoryForPet", () => {
  it("drops the held directory and clears the pet's back-pointer", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    const linked = registerWorkingDirectory(state, {
      petId: "pet-1",
      path: "D:\\code\\one",
      workingDirectoryId: "wd-1",
      agentSourceId: "agent-1",
      now: 99,
    });
    if (linked.status === "linked") state = linked.state;

    const next = clearWorkingDirectoryForPet(state, "pet-1");

    expect(next.registeredWorkingDirectories).toHaveLength(0);
    expect(next.pets[0].workingDirectoryId).toBeNull();
  });

  it("leaves other pets' directories intact", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    state = adopt(state, "pet-2", "cato");
    const first = registerWorkingDirectory(state, {
      petId: "pet-1",
      path: "D:\\code\\one",
      workingDirectoryId: "wd-1",
      agentSourceId: "agent-1",
      now: 99,
    });
    if (first.status === "linked") state = first.state;
    const second = registerWorkingDirectory(state, {
      petId: "pet-2",
      path: "D:\\code\\two",
      workingDirectoryId: "wd-2",
      agentSourceId: "agent-2",
      now: 99,
    });
    if (second.status === "linked") state = second.state;

    const next = clearWorkingDirectoryForPet(state, "pet-1");

    expect(next.registeredWorkingDirectories.map((wd) => wd.petId)).toEqual([
      "pet-2",
    ]);
    expect(
      next.pets.find((pet) => pet.id === "pet-2")?.workingDirectoryId,
    ).toBe("wd-2");
  });

  it("returns state unchanged when the pet is missing or holds no directory", () => {
    const state = adopt(createEmptyPetsDrivenState(), "pet-1");

    expect(clearWorkingDirectoryForPet(state, "pet-missing")).toBe(state);
    expect(clearWorkingDirectoryForPet(state, "pet-1")).toBe(state);
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
    state = adopt(state, "pet-2", "cato");
    state = withDirectory(state, "wd-1");
    state = linkPetToWorkingDirectory(state, "pet-1", "wd-1");

    const stolen = linkPetToWorkingDirectory(state, "pet-2", "wd-1");

    expect(
      stolen.pets.find((pet) => pet.id === "pet-1")?.workingDirectoryId,
    ).toBeNull();
    expect(
      stolen.pets.find((pet) => pet.id === "pet-2")?.workingDirectoryId,
    ).toBe("wd-1");
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

describe("registerWorkingDirectory", () => {
  function register(state: PetsDrivenState, petId: string, path: string) {
    return registerWorkingDirectory(state, {
      petId,
      path,
      workingDirectoryId: `wd-${petId}`,
      agentSourceId: `agent-${petId}`,
      now: 99,
    });
  }

  it("creates a directory at the normalized path and links the pet", () => {
    const state = adopt(createEmptyPetsDrivenState(), "pet-1");

    const result = register(state, "pet-1", "D:/projects/app/");

    expect(result.status).toBe("linked");
    if (result.status !== "linked") return;
    const directory = result.state.registeredWorkingDirectories[0];
    expect(directory.path).toBe("D:\\projects\\app");
    expect(directory.petId).toBe("pet-1");
    expect(result.state.pets[0].workingDirectoryId).toBe(directory.id);
  });

  it("reports occupied when another existing pet already holds the folder", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    state = adopt(state, "pet-2");
    const held = register(state, "pet-1", "D:\\code\\shared");
    if (held.status === "linked") state = held.state;

    const result = register(state, "pet-2", "d:/code/shared");

    expect(result).toEqual({ status: "occupied", ownerPetId: "pet-1" });
  });

  it("relinks the same pet to its existing folder without duplicating it", () => {
    let state = adopt(createEmptyPetsDrivenState(), "pet-1");
    const first = register(state, "pet-1", "D:\\code\\app");
    if (first.status === "linked") state = first.state;

    const result = register(state, "pet-1", "D:\\code\\app");

    expect(result.status).toBe("linked");
    if (result.status !== "linked") return;
    expect(result.state.registeredWorkingDirectories).toHaveLength(1);
  });
});
