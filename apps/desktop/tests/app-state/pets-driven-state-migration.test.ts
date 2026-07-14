import { describe, expect, it } from "vitest";
import {
  createEmptyPetsDrivenState,
  parsePetsDrivenState,
  setPetSourceDirectory,
} from "@/app-state/pets-driven-state";

const v1Payload = {
  schemaVersion: 1,
  registeredWorkingDirectories: [
    {
      id: "wd-1",
      path: "D:\\projects\\alpha",
      petId: "pet-1",
      agentSourceId: "agent-1",
      createdAt: 10,
      updatedAt: 20,
    },
  ],
  pets: [
    {
      id: "pet-1",
      workingDirectoryId: "wd-1",
      assetId: "bloop",
      profileId: "profile-1",
      archived: false,
      visible: true,
    },
    {
      id: "pet-2",
      workingDirectoryId: "",
      assetId: "cato",
      profileId: "profile-2",
      archived: false,
      visible: true,
    },
  ],
  petProfiles: [],
};

describe("parsePetsDrivenState", () => {
  it("creates an empty v3 state", () => {
    expect(createEmptyPetsDrivenState()).toEqual({
      schemaVersion: 3,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
      sessionCommand: "cmd /k claude",
      petSourceDirectory: null,
    });
  });

  it("migrates v1 pets with default name, adoptedAt and nullable link", () => {
    const state = parsePetsDrivenState(v1Payload);

    expect(state.schemaVersion).toBe(3);
    expect(state.pets[0]).toMatchObject({
      id: "pet-1",
      name: "Bloop",
      adoptedAt: 0,
      workingDirectoryId: "wd-1",
    });
    expect(state.pets[1]).toMatchObject({
      id: "pet-2",
      name: "Cato",
      adoptedAt: 0,
      workingDirectoryId: null,
    });
  });

  it("passes v3 state through unchanged", () => {
    const v3 = parsePetsDrivenState(v1Payload);

    expect(parsePetsDrivenState(v3)).toEqual(v3);
  });

  it("returns an empty v3 state for unknown payloads", () => {
    expect(parsePetsDrivenState(null)).toEqual(createEmptyPetsDrivenState());
    expect(parsePetsDrivenState("junk")).toEqual(createEmptyPetsDrivenState());
    expect(parsePetsDrivenState({ schemaVersion: 99 })).toEqual(createEmptyPetsDrivenState());
  });

  it("repairs pet back-pointers from the directory registry", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 2,
      registeredWorkingDirectories: [
        {
          id: "wd-1",
          path: "D:\\projects\\alpha",
          petId: "pet-1",
          agentSourceId: "agent-1",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      pets: [
        {
          id: "pet-1",
          workingDirectoryId: "wd-stale",
          assetId: "bloop",
          profileId: "profile-1",
          name: "Otto",
          adoptedAt: 1,
          archived: false,
          visible: true,
        },
        {
          id: "pet-2",
          workingDirectoryId: "wd-1",
          assetId: "cato",
          profileId: "profile-2",
          name: "Cato",
          adoptedAt: 2,
          archived: false,
          visible: true,
        },
      ],
      petProfiles: [],
    });

    expect(state.pets[0].workingDirectoryId).toBe("wd-1");
    expect(state.pets[1].workingDirectoryId).toBeNull();
  });

  it("defaults memo to an empty string when missing", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 2,
      registeredWorkingDirectories: [],
      pets: [
        {
          id: "pet-1",
          workingDirectoryId: null,
          assetId: "bloop",
          profileId: "profile-1",
          name: "Otto",
          adoptedAt: 1,
          archived: false,
          visible: true,
        },
      ],
      petProfiles: [],
    });

    expect(state.pets[0].memo).toBe("");
  });

  it("preserves an existing memo", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 2,
      registeredWorkingDirectories: [],
      pets: [
        {
          id: "pet-1",
          workingDirectoryId: null,
          assetId: "bloop",
          profileId: "profile-1",
          name: "Otto",
          adoptedAt: 1,
          archived: false,
          visible: true,
          memo: "watch the auth flow",
        },
      ],
      petProfiles: [],
    });

    expect(state.pets[0].memo).toBe("watch the auth flow");
  });

  it("defaults petSourceDirectory to null when missing", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 3,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
    });

    expect(state.petSourceDirectory).toBeNull();
  });

  it("collapses a legacy v2 folder list to its first non-blank entry", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 2,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
      petSourceDirectories: ["  ", 42, "D:\\pets", "C:\\more"],
    });

    expect(state.schemaVersion).toBe(3);
    expect(state.petSourceDirectory).toBe("D:\\pets");
  });

  it("falls back to null for a v2 list with no usable entry", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 2,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
      petSourceDirectories: ["  ", 42],
    });

    expect(state.petSourceDirectory).toBeNull();
  });

  it("rejects a corrupt v3 petSourceDirectory value", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 3,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
      petSourceDirectory: 42,
    });

    expect(state.petSourceDirectory).toBeNull();
  });
});

describe("setPetSourceDirectory", () => {
  it("sets a normalized folder and treats the same folder as a no-op", () => {
    const empty = createEmptyPetsDrivenState();
    const set = setPetSourceDirectory(empty, "D:/pets/../pets/mine/");

    expect(set.petSourceDirectory).toBe("D:\\pets\\mine");

    // A path that normalizes to the same folder is a no-op (same reference).
    expect(setPetSourceDirectory(set, "d:\\pets\\mine")).toBe(set);
  });

  it("ignores a blank path", () => {
    const empty = createEmptyPetsDrivenState();
    expect(setPetSourceDirectory(empty, "   ")).toBe(empty);
  });

  it("resets to the default with null", () => {
    const seeded = setPetSourceDirectory(createEmptyPetsDrivenState(), "D:\\pets\\mine");
    const reset = setPetSourceDirectory(seeded, null);

    expect(reset.petSourceDirectory).toBeNull();

    // Resetting an already-default state is a no-op.
    expect(setPetSourceDirectory(reset, null)).toBe(reset);
  });
});
