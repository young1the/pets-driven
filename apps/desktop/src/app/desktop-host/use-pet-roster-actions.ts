import { useTranslation } from "@pets-driven/i18n";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import type { MutableRefObject } from "react";
import type { AppView } from "@/app/app-navigation";
import { desktopGateway } from "@/app/desktop-gateway";
import { formatCommandError } from "@/app/desktop-host/format-command-error";
import { clearStoredSettings } from "@/app/local-settings-storage";
import { PERSONALITY_OPTIONS } from "@/app/onboarding/personality-options";
import type { PetOverlayMode } from "@/app/pet-overlay-mode";
import { buildLaunchLine, parseLaunchLine } from "@/app/session-launch-line";
import {
  adoptPet,
  clearWorkingDirectoryForPet,
  registerWorkingDirectory,
  removePet,
  setPetAsset,
} from "@/app-state/pet-adoption";
import {
  carryOverPetVisibility,
  createEmptyPetsDrivenState,
  type PetPatch,
  type PetsDrivenState,
  resetSettings,
  setPetSourceDirectory,
} from "@/app-state/pets-driven-state";

// Native folder dialogs are app-modal side effects. Keep the guard outside the
// React tree so duplicate listeners from a remount cannot open a second dialog.
let activeFolderPickerPetId: string | null = null;

/** Built-in Pet Assets cycled through when seeding a debug roster. */
const SEED_ASSET_IDS = ["cato", "otto", "mochi", "fenn", "bloop", "pip"];

type UsePetRosterActionsParams = {
  stateRef: MutableRefObject<PetsDrivenState>;
  /**
   * Whether deploying a pet has a window to open. In single-window overlay mode
   * it does not: the pets share one window the Simulation Host owns, and every
   * pet in it is simply one the frames carry — so a deploy here is the
   * visibility patch alone.
   */
  overlayMode: PetOverlayMode;
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
  overlayMode,
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
   * Settings only: put every app-wide setting back to its default and leave the
   * pets alone. The two halves of "a setting" are reset from their own owners —
   * the state file by the backend command, the frontend-only keys by the storage
   * registry — and the local state is patched first so the settings screen
   * redraws without waiting on the round trip or an app restart.
   */
  async function resetAllSettings() {
    clearStoredSettings();
    applyState(resetSettings(stateRef.current));

    try {
      const persisted = await desktopGateway.resetSettings();
      if (persisted) {
        applyState(carryOverPetVisibility(stateRef.current, persisted));
      }
      flashToast(t("toast.settingsReset"));
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
    applyState({ ...stateRef.current, sessionCommand: command });
    void desktopGateway.updateSettings({ sessionCommand: command });
  }

  /**
   * Pick the shell for the in-app terminal. The same shell backs the launch line
   * a pet double-click runs, so rebuild that line around the command the user
   * already typed instead of leaving the two settings to drift apart.
   */
  function updateTerminalShell(shell: string) {
    const current = stateRef.current;
    const trimmed = shell.trim();
    const terminalShell = trimmed ? trimmed : null;
    const sessionCommand = buildLaunchLine(
      trimmed,
      parseLaunchLine(current.sessionCommand).command,
    );

    applyState({ ...current, terminalShell, sessionCommand });
    void desktopGateway.updateSettings({ terminalShell, sessionCommand });
  }

  // Every mutation below applies to local state first so the UI stays instant,
  // then sends the change itself to the backend, which applies it to whatever is
  // on disk. Nothing here persists the whole state document.
  function patchPet(petId: string, patch: PetPatch) {
    const current = stateRef.current;
    applyState({
      ...current,
      pets: current.pets.map((pet) => (pet.id === petId ? { ...pet, ...patch } : pet)),
    });
    void desktopGateway.updatePet({ petId, ...patch });
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
    applyState({
      ...current,
      petProfiles: current.petProfiles.map((profile) =>
        profile.id === pet.profileId
          ? { ...profile, personalityId, personality: option.factory() }
          : profile,
      ),
    });
    void desktopGateway.updatePet({ petId, personalityId });
  }

  /**
   * Re-skin a pet to another installed Pet Asset. A deployed pet keeps its
   * overlay window: the window's asset id travels on the frame stream, so the
   * sprite swaps in place rather than the window being torn down and rebuilt.
   */
  function setPetAssetId(petId: string, assetId: string) {
    const next = setPetAsset(stateRef.current, petId, assetId);
    if (next === stateRef.current) {
      return;
    }
    applyState(next);
    void desktopGateway.updatePet({ petId, assetId });
  }

  /**
   * `visible` is runtime-only: the gateway strips it before persisting and a
   * load always defaults it to false, so a visibility toggle has nothing to
   * save. Keep it out of the persistence path entirely — the state blob a
   * toggle would write is whatever this window last loaded, which overwrites
   * any pet the backend hatched in the meantime.
   */
  function setPetVisibility(petId: string, visible: boolean) {
    const current = stateRef.current;
    applyState({
      ...current,
      pets: current.pets.map((pet) => (pet.id === petId ? { ...pet, visible } : pet)),
    });
  }

  function showPet(petId: string) {
    const pet = stateRef.current.pets.find((p) => p.id === petId);
    setPetVisibility(petId, true);
    if (overlayMode === "window-per-pet") {
      void desktopGateway.openAdoptedPetWindow(petId, pet?.assetId ?? "").catch(() => {});
    }
    if (pet) {
      flashToast(t("toast.onDesktop", { name: pet.name }));
    }
  }

  function hidePet(petId: string) {
    const pet = stateRef.current.pets.find((p) => p.id === petId);
    setPetVisibility(petId, false);
    void desktopGateway.closeAdoptedPetWindow(petId).catch(() => {});
    if (pet) {
      flashToast(t("toast.cameHome", { name: pet.name }));
    }
  }

  /**
   * Deploy every home pet in one shot. Marking them visible one at a time ran a
   * full `applyState` per pet — an O(n²) cascade of re-renders — and opened each
   * window over its own IPC call, which is what made a large roster stutter.
   * Both halves are now batched: a single visibility patch and a single window
   * request. See `openAdoptedPetWindows` / `open_adopted_pet_windows`.
   */
  function showAllPets() {
    const current = stateRef.current;
    const deployable = current.pets.filter((pet) => !pet.archived);
    if (deployable.length === 0) {
      return;
    }

    const deployableIds = new Set(deployable.map((pet) => pet.id));
    applyState({
      ...current,
      pets: current.pets.map((pet) =>
        deployableIds.has(pet.id) ? { ...pet, visible: true } : pet,
      ),
    });

    if (overlayMode === "window-per-pet") {
      void desktopGateway
        .openAdoptedPetWindows(deployable.map((pet) => ({ petId: pet.id, assetId: pet.assetId })))
        .catch(() => {});
    }
  }

  function hideAllPets() {
    const current = stateRef.current;
    applyState({
      ...current,
      pets: current.pets.map((pet) => ({ ...pet, visible: false })),
    });
    void desktopGateway.closeAllPetWindows().catch(() => {});
  }

  function deletePet(petId: string) {
    const pet = stateRef.current.pets.find((p) => p.id === petId);
    if (!pet || !window.confirm(t("confirm.deletePet", { name: pet.name }))) {
      return;
    }
    applyState(removePet(stateRef.current, petId));
    void desktopGateway.deletePet(petId);
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
      // The local ids above are a placeholder: the backend mints the directory
      // record it persists, so adopt the state it hands back.
      applyState(result.state);

      try {
        const persisted = await desktopGateway.updatePet({ petId, cwd: path });
        if (persisted) {
          applyState(carryOverPetVisibility(stateRef.current, persisted));
        }
      } catch (error) {
        setPetWindowError(formatCommandError(error));
      }
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
    void desktopGateway.updatePet({ petId, cwd: null });
  }

  function applyPetSourceFolder(path: string | null) {
    const next = setPetSourceDirectory(stateRef.current, path);
    if (next === stateRef.current) {
      return;
    }
    applyState(next);
    void desktopGateway.updateSettings({ petSourceDirectory: next.petSourceDirectory });
  }

  async function changePetSourceFolder() {
    const path = await desktopGateway.pickDirectory();
    if (path) {
      applyPetSourceFolder(path);
    }
  }

  /**
   * Open a configured folder in the OS file manager. Shared by the pet-source
   * setting and a pet's working folder, so the caller passes the already
   * resolved path (the effective default, or the pet's bound directory). A
   * folder that has since been deleted rejects, which becomes a toast rather
   * than a silent no-op.
   */
  async function revealFolder(path: string | null) {
    if (!path) {
      return;
    }
    try {
      await desktopGateway.revealPath(path);
    } catch {
      flashToast(t("toast.folderMissing"));
    }
  }

  function setLaunchCommand(command: string) {
    updateSessionCommand(buildLaunchLine(stateRef.current.terminalShell ?? "", command));
  }

  return {
    resetPets,
    resetAllSettings,
    seedWatchedFolders,
    updateSessionCommand,
    updateTerminalShell,
    patchPet,
    setPetPersonality,
    setPetAssetId,
    showPet,
    hidePet,
    showAllPets,
    hideAllPets,
    deletePet,
    pickFolderForPet,
    clearFolderForPet,
    applyPetSourceFolder,
    changePetSourceFolder,
    revealFolder,
    setLaunchCommand,
  };
}
