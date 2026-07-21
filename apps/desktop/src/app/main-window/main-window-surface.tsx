import { useTranslation } from "@pets-driven/i18n";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useMemo, useRef } from "react";
import type { ClaudeHookIngressStatus } from "@/adapters/agent-events/claude-hook-ingress";
import type { AppView } from "@/app/app-navigation";
import { desktopGateway } from "@/app/desktop-gateway";
import type { HomePetView } from "@/app/main-window/home-section";
import { MainWindow, type MainWindowTab } from "@/app/main-window/main-window";
import { cardNote, petGradient, shortWorkingDir } from "@/app/main-window/pet-card-view";
import type { PetEditView } from "@/app/main-window/pet-edit-section";
import { personalityRoleLabelKey } from "@/app/pet-presentation";
import {
  type LaunchProfileId,
  parseLaunchLine,
  promptForLaunchProfile,
} from "@/app/session-launch-profile";
import type { useClaudePlugin } from "@/app/use-claude-plugin";
import { getWorkingDirectoryForPet } from "@/app-state/pet-adoption";
import type { PetCardStatus } from "@/app-state/pet-card-status";
import type { PetRecord, PetsDrivenState } from "@/app-state/pets-driven-state";

export interface MainWindowSurfaceProps {
  state: PetsDrivenState;
  petStatusById: Record<string, PetCardStatus>;
  petWindowError: string | null;
  editPetId: string | null;
  setEditPetId: (id: string | null) => void;
  mainTab: MainWindowTab;
  setMainTab: (tab: MainWindowTab) => void;
  toast: string | null;
  claudeHookIngressStatus: ClaudeHookIngressStatus;
  claudePlugin: ReturnType<typeof useClaudePlugin>;
  defaultPetSourceFolder: string | null;
  navigate: (view: AppView) => void;
  onShowPet: (petId: string) => void;
  onHidePet: (petId: string) => void;
  onShowAllPets: () => void;
  onHideAllPets: () => void;
  onPatchPet: (petId: string, patch: Partial<PetRecord>) => void;
  onSetPetPersonality: (petId: string, personalityId: PetPersonalityId) => void;
  onPickFolderForPet: (petId: string) => void;
  onClearFolderForPet: (petId: string) => void;
  onDeletePet: (petId: string) => void;
  onResetPets: () => void;
  onUpdateSessionCommand: (command: string) => void;
  onSetLaunchProfile: (profile: LaunchProfileId) => void;
  onSetLaunchCommand: (command: string) => void;
  onReconnectHook: () => void;
  onChangePetSourceFolder: () => void;
  onResetPetFolder: () => void;
}

/**
 * Give a prop callback a stable identity for the lifetime of the component, so
 * it can feed a memoized child (HomeSection) without defeating the memo. The
 * host recreates its handlers every render; this keeps the wrapper stable while
 * always calling the latest one.
 */
function useStableCallback<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

/**
 * The main application window (home / terminal / settings / debug). Split out of
 * the host so its view-model derivations can be memoized — the host re-renders
 * on unrelated Tauri events (hook ingress, toast, plugin status), and this
 * boundary keeps the pet roster (HomeSection) from re-rendering when the roster
 * itself hasn't changed.
 */
export function MainWindowSurface({
  state,
  petStatusById,
  petWindowError,
  editPetId,
  setEditPetId,
  mainTab,
  setMainTab,
  toast,
  claudeHookIngressStatus,
  claudePlugin,
  defaultPetSourceFolder,
  navigate,
  onShowPet,
  onHidePet,
  onShowAllPets,
  onHideAllPets,
  onPatchPet,
  onSetPetPersonality,
  onPickFolderForPet,
  onClearFolderForPet,
  onDeletePet,
  onResetPets,
  onUpdateSessionCommand,
  onSetLaunchProfile,
  onSetLaunchCommand,
  onReconnectHook,
  onChangePetSourceFolder,
  onResetPetFolder,
}: MainWindowSurfaceProps) {
  const { t } = useTranslation("desktop");

  // Stable identities for the handlers that feed the memoized HomeSection.
  const showPet = useStableCallback(onShowPet);
  const hidePet = useStableCallback(onHidePet);
  const showAllPets = useStableCallback(onShowAllPets);
  const hideAllPets = useStableCallback(onHideAllPets);
  const editPet = useStableCallback(setEditPetId);
  const addPet = useStableCallback(() => navigate("adopt"));

  const managedPets = useMemo(() => state.pets.filter((pet) => !pet.archived), [state]);

  const atHome: HomePetView[] = useMemo(
    () =>
      managedPets
        .filter((pet) => !pet.visible)
        .map((pet) => {
          const personalityId = state.petProfiles.find(
            (profile) => profile.id === pet.profileId,
          )?.personalityId;
          const dirPath = getWorkingDirectoryForPet(state, pet.id)?.path ?? null;
          return {
            id: pet.id,
            name: pet.name,
            assetId: pet.assetId,
            note: cardNote(pet.memo, t("common.noNote")),
            role: t(personalityRoleLabelKey(personalityId)),
            gradient: petGradient(pet.id),
            cwd: dirPath ? shortWorkingDir(dirPath) : null,
          };
        }),
    [managedPets, state, t],
  );

  const inField = useMemo(
    () =>
      managedPets
        .filter((pet) => pet.visible)
        .map((pet) => ({
          id: pet.id,
          name: pet.name,
          color: petStatusById[pet.id]?.dotColor ?? "var(--ink-300)",
        })),
    [managedPets, petStatusById],
  );

  const home = useMemo(
    () => ({
      atHome,
      inField,
      onDeploy: showPet,
      onRecall: hidePet,
      onEdit: editPet,
      onAddPet: addPet,
      onShowAll: showAllPets,
      onHideAll: hideAllPets,
    }),
    [atHome, inField, showPet, hidePet, editPet, addPet, showAllPets, hideAllPets],
  );

  // Unmemoized derivations for the edit/settings sections (only rendered on
  // their own tab; not on the hot path).
  const profileFor = (pet: PetRecord) =>
    state.petProfiles.find((profile) => profile.id === pet.profileId);
  const editingPet = managedPets.find((pet) => pet.id === editPetId) ?? null;
  const editDirPath = editingPet
    ? (getWorkingDirectoryForPet(state, editingPet.id)?.path ?? null)
    : null;
  const editPetView: PetEditView | null = editingPet
    ? {
        id: editingPet.id,
        name: editingPet.name,
        assetId: editingPet.assetId,
        role: t(personalityRoleLabelKey(profileFor(editingPet)?.personalityId)),
        gradient: petGradient(editingPet.id),
        folder: editDirPath ?? "",
        cwd: editDirPath ? shortWorkingDir(editDirPath) : null,
        memo: editingPet.memo ?? "",
        deployed: editingPet.visible,
        personalityId: profileFor(editingPet)?.personalityId,
      }
    : null;

  const previewPet = managedPets[0];
  const previewWorkingDir = previewPet
    ? (getWorkingDirectoryForPet(state, previewPet.id)?.path ?? null)
    : null;
  const launchSettings = parseLaunchLine(state.sessionCommand);

  return (
    <MainWindow
      debug={{
        error: petWindowError,
        groups: [
          {
            title: "Pets",
            hint: "adoption & state",
            items: [
              { label: "Adopt a pet", onClick: () => navigate("adopt") },
              { label: "Reset pets", onClick: () => onResetPets() },
            ],
          },
          {
            title: "Simulation",
            hint: "world & playground",
            items: [
              {
                label: "Open playground",
                onClick: () => navigate("playground"),
              },
            ],
          },
        ],
      }}
      edit={{
        onName: (value) => editPetId && onPatchPet(editPetId, { name: value }),
        onMemo: (value) => editPetId && onPatchPet(editPetId, { memo: value }),
        onPersonalityId: (value) => editPetId && onSetPetPersonality(editPetId, value),
        onPickFolder: () => editPetId && onPickFolderForPet(editPetId),
        onClearFolder: () => editPetId && onClearFolderForPet(editPetId),
        onToggleDeployed: () =>
          editPetId && (editingPet?.visible ? onHidePet(editPetId) : onShowPet(editPetId)),
        onDelete: () => editPetId && onDeletePet(editPetId),
        onDone: () => setEditPetId(null),
      }}
      editPet={editPetView}
      home={home}
      onTab={(next) => {
        setEditPetId(null);
        setMainTab(next);
      }}
      settings={{
        launchProfile: launchSettings.profile,
        command: launchSettings.command,
        launchLine: launchSettings.launchLine,
        onLaunchProfile: onSetLaunchProfile,
        onCommand: onSetLaunchCommand,
        onLaunchLine: onUpdateSessionCommand,
        preview: {
          prompt: promptForLaunchProfile(launchSettings.profile),
          command: state.sessionCommand,
        },
        hook: {
          tone:
            claudeHookIngressStatus.state === "listening"
              ? "success"
              : claudeHookIngressStatus.state === "pending"
                ? "info"
                : "danger",
          label:
            claudeHookIngressStatus.state === "listening"
              ? t("hook.connected")
              : claudeHookIngressStatus.state === "pending"
                ? t("hook.connecting")
                : t("hook.offline"),
          summary: t("hook.summary", { state: claudeHookIngressStatus.state }),
          url: claudeHookIngressStatus.url,
        },
        onReconnect: () => onReconnectHook(),
        plugin: claudePlugin.status,
        pluginBusy: claudePlugin.busy,
        onInstallPlugin: () => void claudePlugin.install(),
        onUninstallPlugin: () => void claudePlugin.uninstall(),
        petSourceDirectory: state.petSourceDirectory,
        defaultPetSourceDirectory: defaultPetSourceFolder,
        onChangePetFolder: () => onChangePetSourceFolder(),
        onResetPetFolder: () => onResetPetFolder(),
      }}
      terminal={{
        available: isTauri(),
        pickDirectory: () => desktopGateway.pickDirectory(),
        initialCwd: previewWorkingDir,
      }}
      tab={mainTab}
      toast={toast}
    />
  );
}
