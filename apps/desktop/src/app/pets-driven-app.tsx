import { Button } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { PetCommandEvent } from "@/adapters/agent-events/hatch-ingress";
import { useAppNavigation } from "@/app/app-navigation";
import { desktopGateway } from "@/app/desktop-gateway";
import { formatCommandError } from "@/app/desktop-host/format-command-error";
import { useAgentEventIngress } from "@/app/desktop-host/use-agent-event-ingress";
import { useDesktopSimulationHost } from "@/app/desktop-host/use-desktop-simulation-host";
import { usePetRosterActions } from "@/app/desktop-host/use-pet-roster-actions";
import { usePetSessionBindings } from "@/app/desktop-host/use-pet-session-bindings";
import { resolveDesktopFixture } from "@/app/dev-fixtures";
import type { MainWindowTab } from "@/app/main-window/main-window";
import { MainWindowSurface } from "@/app/main-window/main-window-surface";
import { pushSearchParams } from "@/app/spa-navigation";
import { useAgentPlugin } from "@/app/use-agent-plugin";
import {
  carryOverPetVisibility,
  createEmptyPetsDrivenState,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import { PetWindowSurface, petWindowRouteParams } from "@/pet-window/pet-window-route";

// Onboarding and the playground are large surfaces that most sessions never
// open — the wizard and adopt flow only run on first setup, the playground is a
// dev/debug tool. Loading them on demand keeps them out of the main-window
// chunk so the app has less to parse on cold start.
const SetupWizard = lazy(() =>
  import("@/app/onboarding/setup-wizard").then((m) => ({ default: m.SetupWizard })),
);
const AdoptPetFlow = lazy(() =>
  import("@/app/onboarding/adopt-pet-flow").then((m) => ({ default: m.AdoptPetFlow })),
);
const PlaygroundApp = lazy(() =>
  import("@/playground/browser/playground-app").then((m) => ({ default: m.PlaygroundApp })),
);

const EMPTY_PET_PACKAGES_GATEWAY = {
  ...desktopGateway,
  listPetPackages: async () => [],
  listDesignatedPetPackages: async () => [],
};
function createInitialPetsDrivenState(): PetsDrivenState {
  return createEmptyPetsDrivenState();
}

export function PetsDrivenApp({
  // Defaults to a plain URL update (no forced remount) so call sites outside
  // main.tsx's Root — tests, mainly — don't need to wire this up.
  navigateSearchParams = pushSearchParams,
}: {
  navigateSearchParams?: (mutate: (params: URLSearchParams) => void) => void;
}) {
  const petWindowPet = petWindowRouteParams();

  if (petWindowPet) {
    return <PetWindowSurface navigateSearchParams={navigateSearchParams} pet={petWindowPet} />;
  }

  return <PetsDrivenHostApp />;
}

function PetsDrivenHostApp() {
  const { t } = useTranslation("desktop");
  const devFixture = resolveDesktopFixture(window.location.search, {
    hostname: window.location.hostname,
    isDev: import.meta.env.DEV,
  });
  const petsDrivenStateRef = useRef(devFixture?.state ?? createInitialPetsDrivenState());
  const { view, navigate } = useAppNavigation(devFixture?.view ?? "home");
  const [petsDrivenState, setPetsDrivenState] = useState<PetsDrivenState>(
    petsDrivenStateRef.current,
  );
  const [petWindowError, setPetWindowError] = useState<string | null>(null);
  const claudePlugin = useAgentPlugin(desktopGateway, "claude");
  const codexPlugin = useAgentPlugin(desktopGateway, "codex");
  const [mainTab, setMainTab] = useState<MainWindowTab>(devFixture?.tab ?? "home");
  const [editPetId, setEditPetId] = useState<string | null>(devFixture?.editPetId ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function applyPetsDrivenState(next: PetsDrivenState) {
    petsDrivenStateRef.current = next;
    setPetsDrivenState(next);
  }

  // A bare reload of persisted state (e.g. the hatch-triggered state-changed
  // event) would knock already-shown pets out of the sim world, so reload paths
  // go through this instead of applying the state as-is.
  function applyReloadedPetsDrivenState(next: PetsDrivenState) {
    applyPetsDrivenState(carryOverPetVisibility(petsDrivenStateRef.current, next));
  }

  function flashToast(message: string) {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }

  const {
    resetPets,
    resetAllSettings,
    seedWatchedFolders,
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
  } = usePetRosterActions({
    stateRef: petsDrivenStateRef,
    applyState: applyPetsDrivenState,
    flashToast,
    setEditPetId,
    setPetWindowError,
    navigate,
  });

  const {
    emitBindingState,
    focusOrStartSessionForPet,
    startSessionForPet,
    connectTerminalForPet,
    unbindPet,
  } = usePetSessionBindings({
    stateRef: petsDrivenStateRef,
    setPetWindowError,
  });

  const { petStatusById, pushAgentHookEvent } = useDesktopSimulationHost({
    petsDrivenState,
    stateRef: petsDrivenStateRef,
    applyState: applyPetsDrivenState,
    setPetWindowError,
    focusOrStartSessionForPet,
    startSessionForPet,
    connectTerminalForPet,
    unbindPet,
    emitBindingState,
    hidePet,
    pickFolderForPet,
  });

  // The backend owns the hatch write; when it signals a state change, reload
  // the persisted state so the new pet's window opens and it joins the sim.
  function handleBackendStateChanged() {
    void desktopGateway
      .readPetsDrivenState()
      .then((state) => {
        applyReloadedPetsDrivenState(state);
      })
      .catch((error) => {
        setPetWindowError(formatCommandError(error));
      });
  }

  // Backend-triggered show/hide: reload state first so newly hatched pets are
  // in memory before showPet/hidePet run.
  function handlePetCommand({ action, petId }: PetCommandEvent) {
    void desktopGateway
      .readPetsDrivenState()
      .then((state) => {
        applyReloadedPetsDrivenState(state);
        if (action === "show") showPet(petId);
        if (action === "hide") hidePet(petId);
      })
      .catch((error) => {
        setPetWindowError(formatCommandError(error));
      });
  }

  const { claudeHookIngressStatus } = useAgentEventIngress({
    onAgentHookEvent: pushAgentHookEvent,
    onBackendStateChanged: handleBackendStateChanged,
    onPetCommand: handlePetCommand,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once to load persisted state; applyPetsDrivenState/navigate are ref/setState-based, so listing them would re-run the initial load on every render.
  useEffect(() => {
    if (devFixture) {
      return;
    }

    let isMounted = true;

    void desktopGateway
      .readPetsDrivenState()
      .then((state) => {
        if (!isMounted) {
          return;
        }

        applyPetsDrivenState(state);

        if (state.pets.length === 0) {
          navigate("onboarding");
        }
      })
      .catch((error) => {
        if (isMounted) {
          setPetWindowError(formatCommandError(error));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [devFixture]);

  if (view === "playground") {
    return (
      <div className="app-playground-view">
        <Button
          className="app-back-button"
          onClick={() => navigate("home")}
          size="sm"
          variant="neutral"
        >
          {t("common.back")}
        </Button>
        <Suspense fallback={null}>
          <PlaygroundApp />
        </Suspense>
      </div>
    );
  }

  if (view === "onboarding") {
    return (
      <Suspense fallback={null}>
        <SetupWizard
          gateway={
            devFixture?.petPackages === "empty" ? EMPTY_PET_PACKAGES_GATEWAY : desktopGateway
          }
          onCreatePet={() => navigate("adopt")}
          onDone={() => navigate("home")}
          onStateChange={applyPetsDrivenState}
          state={petsDrivenState}
        />
      </Suspense>
    );
  }

  if (view === "adopt") {
    return (
      <Suspense fallback={null}>
        <AdoptPetFlow
          gateway={
            devFixture?.petPackages === "empty" ? EMPTY_PET_PACKAGES_GATEWAY : desktopGateway
          }
          onDone={() => navigate("home")}
          onStateChange={applyPetsDrivenState}
          state={petsDrivenState}
        />
      </Suspense>
    );
  }

  return (
    <MainWindowSurface
      claudeHookIngressStatus={claudeHookIngressStatus}
      claudePlugin={claudePlugin}
      codexPlugin={codexPlugin}
      editPetId={editPetId}
      mainTab={mainTab}
      navigate={navigate}
      onChangePetSourceFolder={() => void changePetSourceFolder()}
      onClearFolderForPet={clearFolderForPet}
      onDeletePet={deletePet}
      onHideAllPets={hideAllPets}
      onHidePet={hidePet}
      onPatchPet={patchPet}
      onPickFolderForPet={(petId: string) => void pickFolderForPet(petId)}
      onResetAllSettings={() => void resetAllSettings()}
      onResetPetFolder={() => applyPetSourceFolder(null)}
      onRevealFolder={(path: string | null) => void revealFolder(path)}
      onResetPets={() => void resetPets()}
      onSetLaunchCommand={setLaunchCommand}
      onSeedWatchedFolders={seedWatchedFolders}
      onSetPetAsset={setPetAssetId}
      onSetPetPersonality={setPetPersonality}
      onShowAllPets={showAllPets}
      onShowPet={showPet}
      onUpdateTerminalShell={updateTerminalShell}
      petStatusById={petStatusById}
      petWindowError={petWindowError}
      setEditPetId={setEditPetId}
      setMainTab={setMainTab}
      state={petsDrivenState}
      toast={toast}
    />
  );
}
