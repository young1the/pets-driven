import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { desktopGateway } from "@/app/desktop-gateway";
import { usePetRosterActions } from "@/app/desktop-host/use-pet-roster-actions";
import type { PetOverlayMode } from "@/app/pet-overlay-mode";
import { createEmptyPetsDrivenState, type PetsDrivenState } from "@/app-state/pets-driven-state";

/**
 * The two halves of a pet's life that touch git: the worktree it is born into,
 * and the worktree it may take with it when it goes.
 */

vi.mock("@/app/desktop-gateway", () => ({
  desktopGateway: {
    addRepoWorktree: vi.fn(),
    listPetPackages: vi.fn(),
    hatchPet: vi.fn(),
    openAdoptedPetWindow: vi.fn(),
    closeAdoptedPetWindow: vi.fn(),
    deletePet: vi.fn(),
    removeRepoWorktree: vi.fn(),
  },
}));

const gateway = vi.mocked(desktopGateway);

const WORKTREE = { path: "D:/work/proj-worktrees/feat-login", repo: "D:/work/proj" };

/** A pet as the backend persists it — visible is stripped on the way back. */
function petRecord(id: string, name: string) {
  return {
    id,
    profileId: `${id}-profile`,
    name,
    assetId: "cato",
    visible: false,
    archived: false,
    note: "",
    scale: 1,
  } as PetsDrivenState["pets"][number];
}

function setup(overlayMode: PetOverlayMode = "window-per-pet") {
  const stateRef = { current: createEmptyPetsDrivenState() };
  const params = {
    stateRef,
    overlayMode,
    // The host applies state through a ref the handlers read back, so the test
    // has to keep the same contract or the second half of a handler sees stale
    // state.
    applyState: vi.fn((next: PetsDrivenState) => {
      stateRef.current = next;
    }),
    flashToast: vi.fn(),
    setEditPetId: vi.fn(),
    setPetWindowError: vi.fn(),
    navigate: vi.fn(),
  };
  const { result } = renderHook(() => usePetRosterActions(params));

  return { ...params, stateRef, actions: result.current };
}

beforeEach(() => {
  vi.clearAllMocks();
  gateway.addRepoWorktree.mockResolvedValue({
    ...WORKTREE,
    branch: "feat/login",
    createdBranch: true,
  });
  gateway.listPetPackages.mockResolvedValue([{ id: "cato" }] as never);
  gateway.hatchPet.mockResolvedValue({
    ...createEmptyPetsDrivenState(),
    pets: [petRecord("pet-new", "feat-login")],
  });
  gateway.openAdoptedPetWindow.mockResolvedValue(undefined);
  gateway.closeAdoptedPetWindow.mockResolvedValue(undefined);
  gateway.deletePet.mockResolvedValue(null);
  gateway.removeRepoWorktree.mockResolvedValue({ ...WORKTREE });
});

describe("createWorktree", () => {
  it("puts the new pet on the desktop rather than leaving it in the roster", async () => {
    const { actions, stateRef } = setup();

    await actions.createWorktree({ repo: "D:/work/proj", branch: "feat/login" });

    // Persisted state always comes back at home, so this is the deploy.
    expect(stateRef.current.pets.find((pet) => pet.id === "pet-new")?.visible).toBe(true);
    expect(gateway.openAdoptedPetWindow).toHaveBeenCalledWith("pet-new", "cato");
  });

  it("deploys without a window of its own in the single-window overlay", async () => {
    const { actions, stateRef } = setup("single-window");

    await actions.createWorktree({ repo: "D:/work/proj", branch: "feat/login" });

    expect(stateRef.current.pets.find((pet) => pet.id === "pet-new")?.visible).toBe(true);
    // The overlay carries every visible pet in its frames; there is no window
    // to open for one of them.
    expect(gateway.openAdoptedPetWindow).not.toHaveBeenCalled();
  });

  it("leaves the folder standing when the pet could not be adopted", async () => {
    gateway.hatchPet.mockRejectedValue(new Error("folder already has pet pet-1"));
    const { actions } = setup();

    const result = await actions.createWorktree({ repo: "D:/work/proj", branch: "feat/login" });

    expect(result.worktree.path).toBe(WORKTREE.path);
    expect(result.petError).toContain("already has pet");
    expect(gateway.openAdoptedPetWindow).not.toHaveBeenCalled();
  });
});

describe("deletePet", () => {
  /** A pet already on the desktop, standing in the worktree folder. */
  function withPet(overlayMode?: PetOverlayMode) {
    const harness = setup(overlayMode);
    harness.stateRef.current = {
      ...harness.stateRef.current,
      pets: [petRecord("pet-1", "Rex")],
      registeredWorkingDirectories: [
        {
          id: "wd-1",
          petId: "pet-1",
          path: WORKTREE.path,
          agentSourceId: "agent-1",
          createdAt: 0,
        } as PetsDrivenState["registeredWorkingDirectories"][number],
      ],
    };

    return harness;
  }

  it("leaves the folder alone unless it was asked for", async () => {
    const { actions, stateRef } = withPet();

    await actions.deletePet("pet-1");

    expect(gateway.removeRepoWorktree).not.toHaveBeenCalled();
    expect(gateway.deletePet).toHaveBeenCalledWith("pet-1");
    expect(stateRef.current.pets).toHaveLength(0);
  });

  it("removes the folder before the pet that stood in it", async () => {
    const { actions } = withPet();

    await actions.deletePet("pet-1", { removeWorktree: true, force: true });

    expect(gateway.removeRepoWorktree).toHaveBeenCalledWith({
      path: WORKTREE.path,
      force: true,
    });
    expect(gateway.deletePet).toHaveBeenCalledWith("pet-1");
  });

  it("keeps the pet when git refuses to remove its folder", async () => {
    gateway.removeRepoWorktree.mockRejectedValue(new Error("locked"));
    const { actions, stateRef } = withPet();

    await expect(actions.deletePet("pet-1", { removeWorktree: true })).rejects.toThrow("locked");

    // Nothing was taken away, so the pet is still there to try again from.
    expect(gateway.deletePet).not.toHaveBeenCalled();
    expect(stateRef.current.pets).toHaveLength(1);
  });
});
