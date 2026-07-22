import { useTranslation } from "@pets-driven/i18n";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import type { MutableRefObject } from "react";
import type { AppView } from "@/app/app-navigation";
import { desktopGateway } from "@/app/desktop-gateway";
import { formatCommandError } from "@/app/desktop-host/format-command-error";
import { PERSONALITY_OPTIONS } from "@/app/onboarding/personality-options";
import { buildLaunchLine, parseLaunchLine } from "@/app/session-launch-line";
import {
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
