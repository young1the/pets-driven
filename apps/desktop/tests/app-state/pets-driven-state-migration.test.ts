import { describe, expect, it } from "vitest";
import {
  createEmptyPetsDrivenState,
  parsePetsDrivenState,
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
  it("creates an empty v2 state", () => {
    expect(createEmptyPetsDrivenState()).toEqual({
      schemaVersion: 2,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
      sessionCommand: "cmd /k claude",
    });
  });

  it("migrates v1 pets with default name, adoptedAt and nullable link", () => {
    const state = parsePetsDrivenState(v1Payload);

    expect(state.schemaVersion).toBe(2);
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

  it("passes v2 state through unchanged", () => {
    const v2 = parsePetsDrivenState(v1Payload);

    expect(parsePetsDrivenState(v2)).toEqual(v2);
  });


  it("returns an empty v2 state for unknown payloads", () => {
    expect(parsePetsDrivenState(null)).toEqual(createEmptyPetsDrivenState());
    expect(parsePetsDrivenState("junk")).toEqual(createEmptyPetsDrivenState());
    expect(parsePetsDrivenState({ schemaVersion: 99 })).toEqual(
      createEmptyPetsDrivenState(),
    );
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
});
