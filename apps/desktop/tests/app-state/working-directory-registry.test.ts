import { describe, expect, it } from "vitest";
import {
  createEmptyPetsDrivenState,
  resolveRegisteredWorkingDirectoryForCwd,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";

describe("working directory registry", () => {
  it("starts with an empty persisted state shape", () => {
    expect(createEmptyPetsDrivenState()).toEqual({
      schemaVersion: 2,
      registeredWorkingDirectories: [],
      pets: [],
      petProfiles: [],
    });
  });

  it("resolves a hook cwd to the longest registered working directory ancestor", () => {
    const state: PetsDrivenState = {
      schemaVersion: 2,
      registeredWorkingDirectories: [
        {
          id: "wd-cms",
          path: "D:\\cms",
          petId: "pet-cms",
          agentSourceId: "agent-cms",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "wd-tool-api",
          path: "D:\\cms\\tool-api",
          petId: "pet-tool-api",
          agentSourceId: "agent-tool-api",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      pets: [],
      petProfiles: [],
    };

    expect(
      resolveRegisteredWorkingDirectoryForCwd(
        state,
        "d:/cms/tool-api/src/main/resources/static/js/template/test",
      ),
    ).toEqual(state.registeredWorkingDirectories[1]);
  });

  it("does not match sibling directories with the same prefix", () => {
    const state: PetsDrivenState = {
      ...createEmptyPetsDrivenState(),
      registeredWorkingDirectories: [
        {
          id: "wd-cms",
          path: "D:\\cms",
          petId: "pet-cms",
          agentSourceId: "agent-cms",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    expect(
      resolveRegisteredWorkingDirectoryForCwd(state, "D:\\cms-other"),
    ).toBeNull();
  });
});
