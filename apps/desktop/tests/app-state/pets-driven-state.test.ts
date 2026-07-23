import { describe, expect, it } from "vitest";
import {
  createEmptyPetsDrivenState,
  parsePetsDrivenState,
  resetSettings,
  setPetSourceDirectory,
} from "@/app-state/pets-driven-state";

describe("parsePetsDrivenState", () => {
  it("creates an empty state", () => {
    expect(createEmptyPetsDrivenState()).toEqual({
      schemaVersion: 1,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
      sessionCommand: "cmd /k claude",
      terminalShell: null,
      petSourceDirectory: null,
    });
  });

  it("passes a well-formed state through unchanged", () => {
    const state = parsePetsDrivenState({
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
          name: "Bloop",
          adoptedAt: 100,
          archived: false,
          visible: true,
        },
      ],
      petProfiles: [],
    });

    expect(parsePetsDrivenState(state)).toEqual(state);
  });

  it("returns an empty state for unknown or unversioned payloads", () => {
    expect(parsePetsDrivenState(null)).toEqual(createEmptyPetsDrivenState());
    expect(parsePetsDrivenState("junk")).toEqual(createEmptyPetsDrivenState());
    expect(parsePetsDrivenState({ schemaVersion: 99 })).toEqual(createEmptyPetsDrivenState());
  });

  it("repairs pet back-pointers from the directory registry", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 1,
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
      schemaVersion: 1,
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
      schemaVersion: 1,
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
      schemaVersion: 1,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
    });

    expect(state.petSourceDirectory).toBeNull();
  });

  it("normalizes a persisted petSourceDirectory", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 1,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
      petSourceDirectory: "D:/pets/../pets/mine/",
    });

    expect(state.petSourceDirectory).toBe("D:\\pets\\mine");
  });

  it("rejects a corrupt petSourceDirectory value", () => {
    const state = parsePetsDrivenState({
      schemaVersion: 1,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
      petSourceDirectory: 42,
    });

    expect(state.petSourceDirectory).toBeNull();
  });
});

describe("resetSettings", () => {
  it("restores every setting and keeps the pets", () => {
    const configured = parsePetsDrivenState({
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
          name: "Bloop",
          adoptedAt: 100,
          archived: false,
          visible: true,
          memo: "watch the auth flow",
        },
      ],
      petProfiles: [{ id: "profile-1", petAssetId: "bloop", personalityId: "playful" }],
      sessionCommand: "pwsh -NoLogo -Command codex",
      terminalShell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      petSourceDirectory: "D:\\pets\\mine",
    });

    const reset = resetSettings(configured);
    const defaults = createEmptyPetsDrivenState();

    expect(reset.sessionCommand).toBe(defaults.sessionCommand);
    expect(reset.terminalShell).toBeNull();
    expect(reset.petSourceDirectory).toBeNull();

    // The pet, its profile, its memo and the folder it watches are user data:
    // a settings reset must not be a way to lose them.
    expect(reset.pets).toBe(configured.pets);
    expect(reset.petProfiles).toBe(configured.petProfiles);
    expect(reset.registeredWorkingDirectories).toBe(configured.registeredWorkingDirectories);
  });

  it("is the empty state when nothing was adopted", () => {
    expect(resetSettings(createEmptyPetsDrivenState())).toEqual(createEmptyPetsDrivenState());
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
