import { useTranslation } from "@pets-driven/i18n";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import type { MutableRefObject } from "react";
import type { AppView } from "@/app/app-navigation";
import { desktopGateway } from "@/app/desktop-gateway";
import { formatCommandError } from "@/app/desktop-host/format-command-error";
import { PERSONALITY_OPTIONS } from "@/app/onboarding/personality-options";
import { buildLaunchLine, parseLaunchLine } from "@/app/session-launch-line";
import {
  adoptPet,
  clearWorkingDirectoryForPet,
  registerWorkingDirectory,
  removePet,
} from "@/app-state/pet-adoption";
import {
  createEmptyPetsDrivenState,
  type PetRecord,
  type PetsDrivenState,
  setPetSourceDirectory,
} from "@/app-state/pets-driven-state";

// Native folder dialogs are app-modal side effects. Keep the guard outside the
// React tree so duplicate listeners from a remount cannot open a second dialog.
let activeFolderPickerPetId: string | null = null;

/** Built-in Pet Assets cycled through when seeding a debug roster. */
const SEED_ASSET_IDS = ["cato", "otto", "mochi", "fenn", "bloop", "pip"];

type UsePetRosterActionsParams = {
  stateRef: MutableRefObject<PetsDrivenState>;
  applyState: (next: PetsDrivenState) => void;
  flashToast: (message: string) => void;
  setEditPetId: (petId: string | null) => void;
  setPetWindowError: (message: string | null) => void;
  navigate: (view: AppView) => void;
};

/**
 * Roster and settings mutations for the desktop host: show/hide, personality,
 * folder binding, launch settings and delete/reset. Each handler reads the live
 * state through `stateRef`, writes through `applyState`, and persists via the
 * gateway — the same behavior the host used to inline.
 */
export function usePetRosterActions({
  stateRef,
  applyState,
  flashToast,
  setEditPetId,
  setPetWindowError,
  navigate,
}: UsePetRosterActionsParams) {
  const { t } = useTranslation("desktop");

  async function resetPets() {
    setPetWindowError(null);

    const empty = createEmptyPetsDrivenState();

    try {
      await desktopGateway.closeAllPetWindows();
      await desktopGateway.writePetsDrivenState(empty);
      applyState(empty);
      navigate("onboarding");
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  /**
   * Dev-only: adopt `count` pets in a single write, each already holding a
   * watch folder. The paths are synthetic strings and need not exist on disk —
   * the registry only ever compares them as text — which is the point: it fills
   * the working directory registry without `count` trips through the native
   * folder picker. Stamping the run time into the path keeps repeated presses
   * from colliding with the folders an earlier press registered.
   */
  function seedWatchedFolders(count: number) {
    const now = Date.now();
    const seededPetIds: string[] = [];
    let next = stateRef.current;

    for (let index = 0; index < count; index++) {
      const petId = crypto.randomUUID();
      const option = PERSONALITY_OPTIONS[index % PERSONALITY_OPTIONS.length];

      next = adoptPet(next, {
        id: petId,
        profileId: crypto.randomUUID(),
        name: `Seed ${index + 1}`,
        assetId: SEED_ASSET_IDS[index % SEED_ASSET_IDS.length],
        personalityId: option.id,
        personality: option.factory(),
        now,
      });

      const result = registerWorkingDirectory(next, {
        petId,
        path: `C:\\debug\\seed-${now}\\workspace-${index + 1}`,
        workingDirectoryId: crypto.randomUUID(),
        agentSourceId: crypto.randomUUID(),
        now,
      });

      // Unreachable while the paths carry `now`, but registration is the only
      // thing that can fail here — keep the pet rather than drop the batch.
      if (result.status === "linked") {
        next = result.state;
      }

      seededPetIds.push(petId);
    }

    // `adoptPet` marks a pet visible; seeded pets stay home so this doesn't
    // open `count` always-on-top windows at once.
    const seeded = new Set(seededPetIds);
    next = {
      ...next,
      pets: next.pets.map((pet) => (seeded.has(pet.id) ? { ...pet, visible: false } : pet)),
    };

    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
    flashToast(`Seeded ${count} pets with watch folders`);
  }

  function updateSessionCommand(command: string) {
    const next = { ...stateRef.current, sessionCommand: command };
    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  /**
   * Pick the shell for the in-app terminal. The same shell backs the launch line
   * a pet double-click runs, so rebuild that line around the command the user
   * already typed instead of leaving the two settings to drift apart.
   */
  function updateTerminalShell(shell: string) {
    const current = stateRef.current;
    const trimmed = shell.trim();
    const next = {
      ...current,
      terminalShell: trimmed ? trimmed : null,
      sessionCommand: buildLaunchLine(trimmed, parseLaunchLine(current.sessionCommand).command),
    };
    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  function patchPet(petId: string, patch: Partial<PetRecord>) {
    const current = stateRef.current;
    const next: PetsDrivenState = {
      ...current,
      pets: current.pets.map((pet) => (pet.id === petId ? { ...pet, ...patch } : pet)),
    };
    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  function setPetPersonality(petId: string, personalityId: PetPersonalityId) {
    const current = stateRef.current;
    const pet = current.pets.find((p) => p.id === petId);
    if (!pet) {
      return;
    }
    const option = PERSONALITY_OPTIONS.find((o) => o.id === personalityId);
    if (!option) {
      return;
    }
    const next: PetsDrivenState = {
      ...current,
      petProfiles: current.petProfiles.map((profile) =>
        profile.id === pet.profileId
          ? { ...profile, personalityId, personality: option.factory() }
          : profile,
      ),
    };
    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  function showPet(petId: string) {
    const pet = stateRef.current.pets.find((p) => p.id === petId);
    patchPet(petId, { visible: true });
    void desktopGateway.openAdoptedPetWindow(petId, pet?.assetId ?? "").catch(() => {});
    if (pet) {
      flashToast(t("toast.onDesktop", { name: pet.name }));
    }
  }

  function hidePet(petId: string) {
    const pet = stateRef.current.pets.find((p) => p.id === petId);
    patchPet(petId, { visible: false });
    void desktopGateway.closeAdoptedPetWindow(petId).catch(() => {});
    if (pet) {
      flashToast(t("toast.cameHome", { name: pet.name }));
    }
  }

  function showAllPets() {
    for (const pet of stateRef.current.pets.filter((p) => !p.archived)) {
      patchPet(pet.id, { visible: true });
      void desktopGateway.openAdoptedPetWindow(pet.id, pet.assetId).catch(() => {});
    }
  }

  function hideAllPets() {
    const current = stateRef.current;
    const next: PetsDrivenState = {
      ...current,
      pets: current.pets.map((pet) => ({ ...pet, visible: false })),
    };
    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
    void desktopGateway.closeAllPetWindows().catch(() => {});
  }

  function deletePet(petId: string) {
    const pet = stateRef.current.pets.find((p) => p.id === petId);
    if (!pet || !window.confirm(t("confirm.deletePet", { name: pet.name }))) {
      return;
    }
    const next = removePet(stateRef.current, petId);
    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
    void desktopGateway.closeAdoptedPetWindow(petId).catch(() => {});
    setEditPetId(null);
    flashToast(t("toast.removed", { name: pet.name }));
  }

  async function pickFolderForPet(petId: string) {
    if (activeFolderPickerPetId !== null) {
      return;
    }

    activeFolderPickerPetId = petId;

    try {
      const path = await desktopGateway.pickDirectory();
      if (!path) {
        return;
      }
      const result = registerWorkingDirectory(stateRef.current, {
        petId,
        path,
        workingDirectoryId: crypto.randomUUID(),
        agentSourceId: crypto.randomUUID(),
        now: Date.now(),
      });
      if (result.status === "occupied") {
        flashToast(t("toast.folderOccupied"));
        return;
      }
      applyState(result.state);
      void desktopGateway.writePetsDrivenState(result.state);
    } finally {
      activeFolderPickerPetId = null;
    }
  }

  function clearFolderForPet(petId: string) {
    const next = clearWorkingDirectoryForPet(stateRef.current, petId);
    if (next === stateRef.current) {
      return;
    }
    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  function applyPetSourceFolder(path: string | null) {
    const next = setPetSourceDirectory(stateRef.current, path);
    if (next === stateRef.current) {
      return;
    }
    applyState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  async function changePetSourceFolder() {
    const path = await desktopGateway.pickDirectory();
    if (path) {
      applyPetSourceFolder(path);
    }
  }

  function setLaunchCommand(command: string) {
    updateSessionCommand(buildLaunchLine(stateRef.current.terminalShell ?? "", command));
  }

  return {
    resetPets,
    seedWatchedFolders,
    updateSessionCommand,
    updateTerminalShell,
    patchPet,
    setPetPersonality,
    showPet,
    hidePet,
    showAllPets,
    hideAllPets,
    deletePet,
    pickFolderForPet,
    clearFolderForPet,
    applyPetSourceFolder,
    changePetSourceFolder,
    setLaunchCommand,
  };
}
