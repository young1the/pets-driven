import { useTranslation } from "@pets-driven/i18n";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useMemo, useRef } from "react";
import type { AgentHookIngressStatus } from "@/adapters/agent-events/agent-hook-ingress";
import type { AppView } from "@/app/app-navigation";
import { desktopGateway } from "@/app/desktop-gateway";
import type { HomePetView } from "@/app/main-window/home-section";
import { describeHookLastSignal } from "@/app/main-window/hook-last-signal";
import { MainWindow, type MainWindowTab } from "@/app/main-window/main-window";
import { cardNote, petGradient, shortWorkingDir } from "@/app/main-window/pet-card-view";
import type { PetEditView } from "@/app/main-window/pet-edit-section";
import { usePetAssetOptions } from "@/app/pet-assets/use-pet-asset-options";
import type { PetOverlayMode } from "@/app/pet-overlay-mode";
import { personalityRoleLabelKey } from "@/app/pet-presentation";
import { parseLaunchLine, promptForShell } from "@/app/session-launch-line";
import type { useAgentPlugin } from "@/app/use-agent-plugin";
import { getWorkingDirectoryForPet } from "@/app-state/pet-adoption";
import type { PetCardStatus } from "@/app-state/pet-card-status";
import type { PetPatch, PetRecord, PetsDrivenState } from "@/app-state/pets-driven-state";

/** How many pets the debug seed button adopts in one press. */
const SEED_WATCHED_FOLDER_COUNT = 13;

export interface MainWindowSurfaceProps {
  state: PetsDrivenState;
  petStatusById: Record<string, PetCardStatus>;
  petWindowError: string | null;
  editPetId: string | null;
  setEditPetId: (id: string | null) => void;
  mainTab: MainWindowTab;
  setMainTab: (tab: MainWindowTab) => void;
  toast: string | null;
  claudeHookIngressStatus: AgentHookIngressStatus;
  claudePlugin: ReturnType<typeof useAgentPlugin>;
  codexPlugin: ReturnType<typeof useAgentPlugin>;
  navigate: (view: AppView) => void;
  onShowPet: (petId: string) => void;
  onHidePet: (petId: string) => void;
  onShowAllPets: () => void;
  onHideAllPets: () => void;
  onPatchPet: (petId: string, patch: PetPatch) => void;
  onSetPetPersonality: (petId: string, personalityId: PetPersonalityId) => void;
  onSetPetAsset: (petId: string, assetId: string) => void;
  onPickFolderForPet: (petId: string) => void;
  onClearFolderForPet: (petId: string) => void;
  onDeletePet: (petId: string) => void;
  onResetPets: () => void;
  onSeedWatchedFolders: (count: number) => void;
  onUpdateTerminalShell: (shell: string) => void;
  onSetLaunchCommand: (command: string) => void;
  onChangePetSourceFolder: () => void;
  onResetPetFolder: () => void;
  /** Open a configured folder in the OS file manager; null path is a no-op. */
  onRevealFolder: (path: string | null) => void;
  /** Settings only — the pet roster is user data and survives it. */
  onResetAllSettings: () => void;
  /** Whether the pets get one OS window each or share one desktop-wide overlay. */
  overlayMode: PetOverlayMode;
  onSetOverlayMode: (mode: PetOverlayMode) => void;
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
  codexPlugin,
  navigate,
  onShowPet,
  onHidePet,
  onShowAllPets,
  onHideAllPets,
  onPatchPet,
  onSetPetPersonality,
  onSetPetAsset,
  onPickFolderForPet,
  onClearFolderForPet,
  onDeletePet,
  onResetPets,
  onSeedWatchedFolders,
  onUpdateTerminalShell,
  onSetLaunchCommand,
  onChangePetSourceFolder,
  onResetPetFolder,
  onRevealFolder,
  onResetAllSettings,
  overlayMode,
  onSetOverlayMode,
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
  // Scanned from disk on the shell side, so only ask once a pet is being edited.
  const assetOptions = usePetAssetOptions(editPetId !== null);

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
            note: cardNote(pet.note, t("common.noNote")),
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
        .map((pet) => {
          const status = petStatusById[pet.id];
          return {
            id: pet.id,
            name: pet.name,
            color: status?.dotColor ?? "var(--ink-300)",
            // `info` tone is the working signal; other tones (idle/waiting/
            // failed/done) keep their own dot color and stay static.
            working: status?.tone === "info",
          };
        }),
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
        note: editingPet.note ?? "",
        personalityId: profileFor(editingPet)?.personalityId,
        swapRunningDirections: editingPet.swapRunningDirections ?? false,
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
              {
                // Fills the watch-folder registry past the point where the
                // adopt flow's folder list needs to scroll.
                label: `Seed ${SEED_WATCHED_FOLDER_COUNT} watched folders`,
                onClick: () => onSeedWatchedFolders(SEED_WATCHED_FOLDER_COUNT),
              },
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
        assetOptions,
        onAssetId: (value) => editPetId && onSetPetAsset(editPetId, value),
        onName: (value) => editPetId && onPatchPet(editPetId, { name: value }),
        onNote: (value) => editPetId && onPatchPet(editPetId, { note: value }),
        onPersonalityId: (value) => editPetId && onSetPetPersonality(editPetId, value),
        onSwapRunningDirections: (value) =>
          editPetId && onPatchPet(editPetId, { swapRunningDirections: value }),
        onPickFolder: () => editPetId && onPickFolderForPet(editPetId),
        onOpenFolder: () => onRevealFolder(editDirPath),
        onClearFolder: () => editPetId && onClearFolderForPet(editPetId),
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
        command: launchSettings.command,
        onCommand: onSetLaunchCommand,
        terminalShell: state.terminalShell ?? "",
        onTerminalShell: onUpdateTerminalShell,
        preview: {
          prompt: promptForShell(state.terminalShell ?? launchSettings.shell),
          command: state.sessionCommand,
        },
        hook: {
          tone:
            claudeHookIngressStatus.state === "listening"
              ? "success"
              : claudeHookIngressStatus.state === "pending"
                ? "info"
                : "danger",
          summary: t(`hook.summary.${claudeHookIngressStatus.state}`),
          // Re-read on every render; the status poll in useAgentEventIngress
          // already re-renders this surface every couple of seconds, so the
          // relative time stays current without a clock of its own.
          lastSignal: describeHookLastSignal(claudeHookIngressStatus, t, Date.now()),
          endpoint: claudeHookIngressStatus.url,
          error: claudeHookIngressStatus.error,
          activity: claudeHookIngressStatus.recent ?? [],
          rejectedCount: claudeHookIngressStatus.rejectedCount ?? 0,
          onSendTest: () => desktopGateway.sendTestHookEvent(),
        },
        plugins: [
          {
            provider: "claude",
            status: claudePlugin.status,
            busy: claudePlugin.busy,
            run: claudePlugin.run,
            onInstall: () => claudePlugin.install(),
            onUninstall: () => claudePlugin.uninstall(),
            onCloseRun: () => claudePlugin.dismissRun(),
          },
          {
            provider: "codex",
            status: codexPlugin.status,
            busy: codexPlugin.busy,
            run: codexPlugin.run,
            onInstall: () => codexPlugin.install(),
            onUninstall: () => codexPlugin.uninstall(),
            onCloseRun: () => codexPlugin.dismissRun(),
          },
        ],
        terminalAvailable: isTauri(),
        petSourceDirectory: state.petSourceDirectory,
        onChangePetFolder: () => onChangePetSourceFolder(),
        onOpenPetFolder: () => onRevealFolder(state.petSourceDirectory),
        onResetPetFolder: () => onResetPetFolder(),
        onResetAllSettings: () => onResetAllSettings(),
        onResetPets: () => onResetPets(),
        overlayMode,
        onSetOverlayMode,
      }}
      terminal={{
        available: isTauri(),
        pickDirectory: () => desktopGateway.pickDirectory(),
        initialCwd: previewWorkingDir,
        shell: state.terminalShell,
      }}
      tab={mainTab}
      toast={toast}
    />
  );
}
