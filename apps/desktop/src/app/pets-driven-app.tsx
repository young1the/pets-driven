import { Button } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import {
  createAdoptedPetsScenario,
  createDemoScenario,
  deriveAdoptedPetLocomotion,
} from "@pets-driven/pet-engine/core/scenario-fixtures";
import { PLAYGROUND_PET_ENTITY_IDS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { currentMonitor, cursorPosition } from "@tauri-apps/api/window";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import { createAgentEventFromClaudeHook } from "@/adapters/agent-events/claude-hook-adapter";
import type { PetCommandEvent } from "@/adapters/agent-events/hatch-ingress";
import { useAppNavigation } from "@/app/app-navigation";
import { desktopGateway } from "@/app/desktop-gateway";
import { formatCommandError } from "@/app/desktop-host/format-command-error";
import {
  adoptedPetBodySize,
  desktopFixturePetBodySize,
  loadDesktopMonitorWorkAreas,
  loadMainWindowSpawnPoint,
  projectionBoundsForMonitors,
} from "@/app/desktop-host/monitor-geometry";
import { useAgentEventIngress } from "@/app/desktop-host/use-agent-event-ingress";
import { usePetRosterActions } from "@/app/desktop-host/use-pet-roster-actions";
import { usePetSessionBindings } from "@/app/desktop-host/use-pet-session-bindings";
import { resolveDesktopFixture } from "@/app/dev-fixtures";
import type { MainWindowTab } from "@/app/main-window/main-window";
import { MainWindowSurface } from "@/app/main-window/main-window-surface";
import { shortWorkingDir } from "@/app/main-window/pet-card-view";
import { pushSearchParams } from "@/app/spa-navigation";
import { useClaudePlugin } from "@/app/use-claude-plugin";
import {
  createPetCardStatusTracker,
  type PetCardStatus,
  petStatusFromSnapshot,
} from "@/app-state/pet-card-status";
import { selectAdoptedPetSimInputs } from "@/app-state/pet-surface";
import {
  createEmptyPetsDrivenState,
  type PetsDrivenState,
  resolveRegisteredWorkingDirectoryForCwd,
} from "@/app-state/pets-driven-state";
import { PetWindowFixtureSwitcher } from "@/pet-window/pet-window-fixture-switcher";
import { PET_WINDOW_FIXTURES, resolvePetWindowFixture } from "@/pet-window/pet-window-fixtures";
import { clampPetWindowScale, DEFAULT_PET_WINDOW_SCALE } from "@/pet-window/pet-window-layout";
import {
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_RESIZE_EVENT,
  type PetWindowInputEvent,
  type PetWindowResizeEvent,
} from "@/pet-window/pet-window-messages";
import {
  projectScreenPointToWorld,
  projectWorldSnapshotToPetWindows,
} from "@/pet-window/pet-window-projection";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";
import { PetWindowView } from "@/pet-window/pet-window-view";

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

const DESKTOP_FIXTURE_HOST_TICK_MS = 16;
const DESKTOP_FIXTURE_STEP_MS = 16;
// Unchanged frames are still re-emitted twice a second: pet windows
// re-evaluate their held activity label (steadyActivity) only on incoming
// frames, and a window that finishes creating after its first frame was
// emitted must not wait for the next real change to show itself.
const PET_WINDOW_FRAME_HEARTBEAT_TICKS = Math.round(500 / DESKTOP_FIXTURE_HOST_TICK_MS);
const EMPTY_PET_PACKAGES_GATEWAY = {
  ...desktopGateway,
  listPetPackages: async () => [],
};
function petWindowRouteParams(): PetWindowRouteParams | null {
  const params = new URLSearchParams(window.location.search);
  // A bare `?fixture=<pet-window-fixture-id>` (no `surface=pet-window`, no
  // petId/assetId) should be enough to land on the pet-window tweak menu —
  // resolvePetWindowFixture already gates this to dev + loopback.
  const petWindowFixture = resolvePetWindowFixture(window.location.search, {
    hostname: window.location.hostname,
    isDev: import.meta.env.DEV,
  });

  if (params.get("surface") !== "pet-window" && !petWindowFixture) {
    return null;
  }

  return {
    petId: params.get("petId") || petWindowFixture?.pet.petId || "pet-a",
    assetId: params.get("assetId") || petWindowFixture?.pet.assetId || "bloop",
    windowIndex: params.get("windowIndex")
      ? Number(params.get("windowIndex"))
      : (petWindowFixture?.pet.windowIndex ?? 1),
    name: params.get("name") ?? petWindowFixture?.pet.name ?? undefined,
  };
}

function petWindowPlaygroundLabelForPetId(petId: string) {
  const index = PLAYGROUND_PET_ENTITY_IDS.indexOf(
    petId as (typeof PLAYGROUND_PET_ENTITY_IDS)[number],
  );

  return index >= 0 ? `pet-window-playground-${index + 1}` : null;
}

function createInitialPetsDrivenState(): PetsDrivenState {
  return createEmptyPetsDrivenState();
}

function routeClaudeHookPayloadToRegisteredWorkingDirectory(
  payload: unknown,
  state: PetsDrivenState,
): unknown | null {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const cwd = (payload as { cwd?: unknown }).cwd;

  if (typeof cwd !== "string" || cwd.trim().length === 0) {
    return payload;
  }

  const workingDirectory = resolveRegisteredWorkingDirectoryForCwd(state, cwd);

  if (!workingDirectory) {
    return null;
  }

  return {
    ...payload,
    sourceId: workingDirectory.agentSourceId,
  };
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
    const petWindowFixture = resolvePetWindowFixture(window.location.search, {
      hostname: window.location.hostname,
      isDev: import.meta.env.DEV,
    });

    return (
      <>
        <PetWindowView
          pet={petWindowPet}
          previewPresentation={petWindowFixture?.presentation}
          previewScale={petWindowFixture?.scale}
          previewConnectNotice={petWindowFixture?.connectNotice}
        />
        {petWindowFixture ? (
          <PetWindowFixtureSwitcher
            activeId={petWindowFixture.id}
            onSelect={(fixtureId) =>
              navigateSearchParams((params) => {
                const fixture = PET_WINDOW_FIXTURES.find((candidate) => candidate.id === fixtureId);
                params.set("fixture", fixtureId);
                if (fixture) {
                  params.set("petId", fixture.pet.petId);
                  params.set("assetId", fixture.pet.assetId);
                  params.set("windowIndex", String(fixture.pet.windowIndex));
                  if (fixture.pet.name) {
                    params.set("name", fixture.pet.name);
                  } else {
                    params.delete("name");
                  }
                }
              })
            }
          />
        ) : null}
      </>
    );
  }

  return <PetsDrivenHostApp />;
}

function PetsDrivenHostApp() {
  const { t } = useTranslation("desktop");
  const devFixture = resolveDesktopFixture(window.location.search, {
    hostname: window.location.hostname,
    isDev: import.meta.env.DEV,
  });
  const fixtureScenarioRef = useRef(createDemoScenario());
  const fixtureHostSequenceRef = useRef(0);
  const petsDrivenStateRef = useRef(devFixture?.state ?? createInitialPetsDrivenState());
  const fixtureHostBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const adoptedScenarioRef = useRef<ReturnType<typeof createAdoptedPetsScenario> | null>(null);
  // Display hysteresis for the card status chip — autonomous decisions churn
  // every 500ms-2s, so raw per-tick labels are unreadable without it.
  const adoptedStatusTrackerRef = useRef(createPetCardStatusTracker());
  const adoptedPetIdsRef = useRef<Set<string>>(new Set());
  const adoptedHostSequenceRef = useRef(0);
  // petId -> last frame actually emitted to that pet's window, so idle ticks
  // (same position, same sprite) skip the per-window IPC emit entirely.
  const adoptedLastEmitByPetIdRef = useRef<Map<string, { body: string; sequence: number }>>(
    new Map(),
  );
  const adoptedScaleByPetIdRef = useRef<Record<string, number>>({});
  const adoptedHostBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  // Cursor-as-stimulus: cache the latest physical cursor position (polled
  // once per tick, fire-and-forget) plus the monitor scale factor needed to
  // convert it into the world's logical coordinates. Fed into the shared
  // simulation each tick via world.feedCursorPosition() so chase-cursor and
  // petting reactions can see the live cursor.
  const adoptedCursorPhysicalRef = useRef<{ x: number; y: number } | null>(null);
  const adoptedCursorScaleRef = useRef(1);
  const fixtureCursorPhysicalRef = useRef<{ x: number; y: number } | null>(null);
  const fixtureCursorScaleRef = useRef(1);
  const { view, navigate } = useAppNavigation(devFixture?.view ?? "home");
  const [petsDrivenState, setPetsDrivenState] = useState<PetsDrivenState>(
    petsDrivenStateRef.current,
  );
  const [desktopFixtureWindowCount] = useState(0);
  const [adoptedSimulationResetKey] = useState(0);
  const [petWindowError, setPetWindowError] = useState<string | null>(null);
  const claudePlugin = useClaudePlugin(desktopGateway);
  const [mainTab, setMainTab] = useState<MainWindowTab>(devFixture?.tab ?? "home");
  const [editPetId, setEditPetId] = useState<string | null>(devFixture?.editPetId ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [petStatusById, setPetStatusById] = useState<Record<string, PetCardStatus>>({});
  const [defaultPetSourceFolder, setDefaultPetSourceFolder] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let isActive = true;
    void desktopGateway.getDefaultPetSourceDirectory().then((path) => {
      if (isActive) {
        setDefaultPetSourceFolder(path);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  function applyPetsDrivenState(next: PetsDrivenState) {
    petsDrivenStateRef.current = next;
    setPetsDrivenState(next);
  }

  // `visible` is a runtime-only flag: the backend strips it on write and parsing
  // defaults it to false. A bare reload of persisted state (e.g. the
  // hatch-triggered state-changed event) would therefore knock already-shown
  // pets out of the sim world. Reload paths use this to carry over the current
  // visibility of pets we already know about; freshly persisted pets keep the
  // incoming value and are turned on by their own show command.
  function applyReloadedPetsDrivenState(next: PetsDrivenState) {
    const prevVisible = new Map(
      petsDrivenStateRef.current.pets.map((pet) => [pet.id, pet.visible]),
    );
    applyPetsDrivenState({
      ...next,
      pets: next.pets.map((pet) => {
        const previous = prevVisible.get(pet.id);
        return previous === undefined ? pet : { ...pet, visible: previous };
      }),
    });
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
    updateSessionCommand,
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
    setLaunchProfile,
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

  // Fan a routed Claude hook event into every live world. Only the pet whose
  // AgentBinding.sourceId matches reacts; the others ignore it. Each world
  // stamps the event with its own clock since they advance independently.
  function handleAgentHookEvent(payload: unknown) {
    try {
      const routedPayload = routeClaudeHookPayloadToRegisteredWorkingDirectory(
        payload,
        petsDrivenStateRef.current,
      );

      if (!routedPayload) {
        return;
      }

      for (const scenario of [fixtureScenarioRef.current, adoptedScenarioRef.current]) {
        if (!scenario) {
          continue;
        }

        const agentEvent = createAgentEventFromClaudeHook(routedPayload, {
          defaultSourceId: "agent-a",
          now: scenario.clock.now(),
        });

        scenario.world.pushEvent(toWorldEvent(agentEvent));
      }
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

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

  const { claudeHookIngressStatus, emitClaudeHookTestEvent } = useAgentEventIngress({
    onAgentHookEvent: handleAgentHookEvent,
    onBackendStateChanged: handleBackendStateChanged,
    onPetCommand: handlePetCommand,
    setPetWindowError,
  });

  // Stable signature of the visible pet roster. Roster *membership* changes
  // (a pet shown, hidden or deleted) are reconciled into the live world in
  // place — see the roster-reconcile effect — instead of rebuilding it, so one
  // pet coming or going never resets the others' positions and animation.
  const adoptedSimKey = petsDrivenState.pets
    .filter((pet) => !pet.archived && pet.visible)
    .map((pet) => `${pet.id}:${pet.assetId}`)
    .sort()
    .join(",");
  // Whether any pet is on screen at all. The world-lifecycle effect keys on
  // this boundary alone (not the full roster) so it builds when the first pet
  // appears and tears down when the last leaves, but never rebuilds while pets
  // are merely added to or removed from an already-running world.
  const adoptedHasVisiblePets = adoptedSimKey.length > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once input listener (StrictMode-safe). The handlers it invokes read live state via refs and stable setters, so listing them would only re-register the listener every render and reintroduce duplicate-listener firing.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    // Chain the unlisten off the promise so React StrictMode's mount/cleanup/
    // remount can't leak a duplicate listener (which double-fired every event).
    const listenPromise = listen<PetWindowInputEvent>(PET_WINDOW_INPUT_EVENT, (event) => {
      const input = event.payload;

      if (input.kind === "body.focus") {
        void focusOrStartSessionForPet(input.petId);
        return;
      }
      if (input.kind === "menu.close") {
        hidePet(input.petId);
        return;
      }
      if (input.kind === "menu.note-save") {
        const current = petsDrivenStateRef.current;
        const next: typeof current = {
          ...current,
          pets: current.pets.map((p) =>
            p.id === input.petId ? { ...p, memo: input.memo ?? "" } : p,
          ),
        };
        applyPetsDrivenState(next);
        void desktopGateway.writePetsDrivenState(next);
        return;
      }
      if (input.kind === "menu.pick-folder") {
        void pickFolderForPet(input.petId);
        return;
      }
      if (input.kind === "body.contextmenu" || input.kind === "overlay.contextmenu") {
        const pet = petsDrivenStateRef.current.pets.find((p) => p.id === input.petId);
        void desktopGateway
          .openPetContextMenu(
            input.petId,
            input.petName ?? pet?.name ?? input.petId,
            pet?.memo ?? "",
            input.screenPoint.x,
            input.screenPoint.y,
          )
          .catch(() => {});
        return;
      }
      if (input.kind === "menu.start-session") {
        void startSessionForPet(input.petId);
        return;
      }
      if (input.kind === "menu.find-terminal") {
        void connectTerminalForPet(input.petId);
        return;
      }
      if (input.kind === "menu.unbind") {
        unbindPet(input.petId);
        return;
      }
      if (input.kind === "menu.request-binding") {
        emitBindingState(input.petId);
        return;
      }

      const isAdopted = adoptedPetIdsRef.current.has(input.petId);
      const scenario = isAdopted ? adoptedScenarioRef.current : fixtureScenarioRef.current;
      const bounds = isAdopted ? adoptedHostBoundsRef.current : fixtureHostBoundsRef.current;

      if (!scenario || !bounds || !input.kind.startsWith("body.pointer.")) {
        return;
      }

      const snapshot = scenario.world.snapshot();
      scenario.world.pushEvent({
        kind: "pointer",
        type: input.kind.replace("body.", "") as "pointer.down" | "pointer.move" | "pointer.up",
        pointerId: input.pointerId,
        at: scenario.clock.now(),
        position: projectScreenPointToWorld(snapshot, bounds, input.screenPoint),
        button: input.button ?? 0,
      });
    });

    return () => {
      void listenPromise.then((stop) => stop());
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once resize listener; its body reads live state via refs, so re-subscribing on handler identity changes would add churn without changing behavior.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void listen<PetWindowResizeEvent>(PET_WINDOW_RESIZE_EVENT, (event) => {
      const { petId, scale } = event.payload;
      const nextScale = clampPetWindowScale(scale);
      adoptedScaleByPetIdRef.current = {
        ...adoptedScaleByPetIdRef.current,
        [petId]: nextScale,
      };
      // The live simulation body was sized to the pet's previous scale; resize
      // it (and rescale its mass-tuned walk/jump forces) in place so the sprite
      // and its physics body stay the same size. Without this the enlarged
      // sprite's feet sink below the floor — its y drifts down — until the world
      // is rebuilt, e.g. by sending the pet home and redeploying it.
      const scenario = adoptedScenarioRef.current;
      if (scenario?.world.getEntity(petId)) {
        const bodySize = adoptedPetBodySize(nextScale);
        scenario.world.setBodySize(petId, bodySize);
        const personality = selectAdoptedPetSimInputs(petsDrivenStateRef.current).find(
          (input) => input.id === petId,
        )?.personality;
        const { canWalk, canJump } = deriveAdoptedPetLocomotion(bodySize, personality);
        scenario.world.setComponent(petId, canWalk);
        scenario.world.setComponent(petId, canJump);
      }
      const current = petsDrivenStateRef.current;
      const next: typeof current = {
        ...current,
        pets: current.pets.map((p) => (p.id === petId ? { ...p, scale: nextScale } : p)),
      };
      applyPetsDrivenState(next);
      void desktopGateway.writePetsDrivenState(next);
    }).then((stop) => {
      unlisten = stop;
    });

    return () => unlisten?.();
  }, []);

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

  useEffect(() => {
    if (!isTauri() || desktopFixtureWindowCount <= 0) {
      return;
    }

    let isActive = true;
    let isBroadcasting = false;

    void currentMonitor().then((monitor) => {
      if (!isActive || !monitor) {
        return;
      }

      const fixtureDpi = monitor.scaleFactor;
      fixtureCursorScaleRef.current = fixtureDpi;
      fixtureHostBoundsRef.current = {
        x: monitor.workArea.position.x / fixtureDpi,
        y: monitor.workArea.position.y / fixtureDpi,
        width: monitor.workArea.size.width / fixtureDpi,
        height: monitor.workArea.size.height / fixtureDpi,
      };
      fixtureScenarioRef.current = createDemoScenario({
        petBodySize: desktopFixturePetBodySize(fixtureHostBoundsRef.current),
      });
      fixtureHostSequenceRef.current = 0;
    });

    const intervalId = window.setInterval(() => {
      if (isBroadcasting) {
        return;
      }

      const bounds = fixtureHostBoundsRef.current;

      if (!bounds) {
        return;
      }

      isBroadcasting = true;

      // Cache the latest cursor position asynchronously — never block the tick.
      void cursorPosition()
        .then((physical) => {
          fixtureCursorPhysicalRef.current = { x: physical.x, y: physical.y };
        })
        .catch(() => {
          fixtureCursorPhysicalRef.current = null;
        });

      const fixtureCursorPhysical = fixtureCursorPhysicalRef.current;
      if (fixtureCursorPhysical) {
        const scale = fixtureCursorScaleRef.current || 1;
        fixtureScenarioRef.current.world.feedCursorPosition(
          {
            x: fixtureCursorPhysical.x / scale,
            y: fixtureCursorPhysical.y / scale,
          },
          fixtureScenarioRef.current.clock.now(),
        );
      }

      fixtureScenarioRef.current.clock.advanceBy(DESKTOP_FIXTURE_STEP_MS);
      fixtureScenarioRef.current.world.step(DESKTOP_FIXTURE_STEP_MS);
      fixtureHostSequenceRef.current += 1;

      const projections = projectWorldSnapshotToPetWindows(
        fixtureScenarioRef.current.world.snapshot(),
        bounds,
        fixtureHostSequenceRef.current,
      ).slice(0, desktopFixtureWindowCount);

      void Promise.all(
        projections.flatMap((projection) => {
          const label = petWindowPlaygroundLabelForPetId(projection.petId);

          if (!label) {
            return [];
          }

          const petRecord = petsDrivenStateRef.current.pets.find((p) => p.id === projection.petId);
          const frame = petRecord
            ? { ...projection.frame, name: petRecord.name }
            : projection.frame;

          return [emitTo(label, PET_WINDOW_FRAME_EVENT, frame)];
        }),
      ).finally(() => {
        isBroadcasting = false;
      });
    }, DESKTOP_FIXTURE_HOST_TICK_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [desktopFixtureWindowCount]);

  // Drive the user's adopted pets the same way the fixture host drives the
  // playground: one shared simulation world, projected onto each pet's overlay
  // window. Rebuilds whenever the visible roster changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adoptedHasVisiblePets and adoptedSimulationResetKey are intentional rebuild triggers; the body reads state via refs. Removing them would stop the adopted-pet sim from rebuilding when the roster changes or a reset is requested.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const simInputs = selectAdoptedPetSimInputs(petsDrivenStateRef.current);

    if (simInputs.length === 0) {
      adoptedScenarioRef.current = null;
      adoptedStatusTrackerRef.current = createPetCardStatusTracker();
      adoptedPetIdsRef.current = new Set();
      adoptedLastEmitByPetIdRef.current = new Map();
      return;
    }

    let isActive = true;
    let isBroadcasting = false;

    // Each visible pet needs its overlay window before frames can land.
    for (const pet of simInputs) {
      const record = petsDrivenStateRef.current.pets.find((candidate) => candidate.id === pet.id);

      if (record) {
        void desktopGateway.openAdoptedPetWindow(record.id, record.assetId).catch(() => {});
      }
    }

    void Promise.all([
      loadDesktopMonitorWorkAreas(),
      loadMainWindowSpawnPoint(),
      currentMonitor(),
    ]).then(([monitors, spawnPoint, monitor]) => {
      if (!isActive || monitors.length === 0) {
        return;
      }

      adoptedCursorScaleRef.current = monitor?.scaleFactor ?? 1;

      const bounds = projectionBoundsForMonitors(monitors);
      adoptedHostBoundsRef.current = bounds;
      const petRecords = petsDrivenStateRef.current.pets;
      const petBodySizeByPetId: Record<string, { width: number; height: number }> = {};
      const scaleByPetId: Record<string, number> = {};
      for (const pet of simInputs) {
        const record = petRecords.find((r) => r.id === pet.id);
        const scale = clampPetWindowScale(record?.scale ?? DEFAULT_PET_WINDOW_SCALE);
        scaleByPetId[pet.id] = scale;
        petBodySizeByPetId[pet.id] = adoptedPetBodySize(scale);
      }
      adoptedScenarioRef.current = createAdoptedPetsScenario(simInputs, {
        petBodySizeByPetId,
        monitors,
        spawnPoint: spawnPoint ?? undefined,
      });
      adoptedPetIdsRef.current = new Set(simInputs.map((pet) => pet.id));
      // Do NOT reset the frame sequence here. It must stay monotonically
      // increasing across world rebuilds: an already-open pet window rejects any
      // frame whose sequence is <= the last it processed (isFreshPetWindowMessage).
      // Rebuilding the world when a second pet is deployed and restarting the
      // counter at 0 made every frame look stale to the existing window, freezing
      // it until the counter climbed back past where it had been (~tens of seconds).
      adoptedLastEmitByPetIdRef.current = new Map();
      adoptedScaleByPetIdRef.current = scaleByPetId;
      adoptedStatusTrackerRef.current = createPetCardStatusTracker();
    });

    const intervalId = window.setInterval(() => {
      if (isBroadcasting) {
        return;
      }

      const scenario = adoptedScenarioRef.current;
      const bounds = adoptedHostBoundsRef.current;

      if (!scenario || !bounds) {
        return;
      }

      isBroadcasting = true;

      // Cache the latest cursor position asynchronously — never block the tick.
      void cursorPosition()
        .then((physical) => {
          adoptedCursorPhysicalRef.current = { x: physical.x, y: physical.y };
        })
        .catch(() => {
          adoptedCursorPhysicalRef.current = null;
        });

      const cursorPhysical = adoptedCursorPhysicalRef.current;
      if (cursorPhysical) {
        const scale = adoptedCursorScaleRef.current || 1;
        scenario.world.feedCursorPosition(
          { x: cursorPhysical.x / scale, y: cursorPhysical.y / scale },
          scenario.clock.now(),
        );
      }

      scenario.clock.advanceBy(DESKTOP_FIXTURE_STEP_MS);
      scenario.world.step(DESKTOP_FIXTURE_STEP_MS);
      adoptedHostSequenceRef.current += 1;

      const snapshot = scenario.world.snapshot();

      const nextStatuses: Record<string, PetCardStatus> = {};
      for (const petSnapshot of snapshot.pets) {
        nextStatuses[petSnapshot.id] = adoptedStatusTrackerRef.current.track(
          petSnapshot.id,
          petStatusFromSnapshot(petSnapshot),
          scenario.clock.now(),
        );
      }
      setPetStatusById((current) => {
        const sameKeys =
          Object.keys(current).length === Object.keys(nextStatuses).length &&
          Object.keys(nextStatuses).every(
            (id) =>
              current[id]?.label === nextStatuses[id]?.label &&
              current[id]?.tone === nextStatuses[id]?.tone &&
              current[id]?.dotColor === nextStatuses[id]?.dotColor,
          );
        return sameKeys ? current : nextStatuses;
      });

      const projections = projectWorldSnapshotToPetWindows(
        snapshot,
        bounds,
        adoptedHostSequenceRef.current,
        adoptedScaleByPetIdRef.current,
      );

      const pets = petsDrivenStateRef.current.pets;
      const dirs = petsDrivenStateRef.current.registeredWorkingDirectories;
      void Promise.all(
        projections.flatMap((projection) => {
          const petRecord = pets.find((p) => p.id === projection.petId);
          const dirPath = dirs.find((d) => d.petId === projection.petId)?.path ?? null;
          const frame = petRecord
            ? {
                ...projection.frame,
                name: petRecord.name,
                cwd: dirPath ? shortWorkingDir(dirPath) : undefined,
              }
            : projection.frame;

          // Idle pets produce byte-identical frames tick after tick; skip the
          // cross-webview emit for those (modulo the heartbeat re-send).
          const body = JSON.stringify({ ...frame, sequence: 0 });
          const lastEmit = adoptedLastEmitByPetIdRef.current.get(projection.petId);
          if (
            lastEmit &&
            lastEmit.body === body &&
            frame.sequence - lastEmit.sequence < PET_WINDOW_FRAME_HEARTBEAT_TICKS
          ) {
            return [];
          }

          adoptedLastEmitByPetIdRef.current.set(projection.petId, {
            body,
            sequence: frame.sequence,
          });
          return [emitTo(`pet-window-${projection.petId}`, PET_WINDOW_FRAME_EVENT, frame)];
        }),
      ).finally(() => {
        isBroadcasting = false;
      });
    }, DESKTOP_FIXTURE_HOST_TICK_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptedHasVisiblePets, adoptedSimulationResetKey]);

  // Reconcile the live simulation roster in place whenever pets are shown,
  // hidden or deleted. The world-lifecycle effect above only builds/tears down
  // on the has-any-pets boundary; membership churn while at least one pet is on
  // screen is applied here by adding/removing just the affected pet, leaving
  // every other pet's position and animation untouched.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adoptedSimKey is an intentional rebuild trigger; the body reads state via refs. Removing it would freeze the sim after the first mount.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const scenario = adoptedScenarioRef.current;
    if (!scenario) {
      // No live world yet (first pet still loading) or it was just torn down.
      // The lifecycle effect (re)builds from the current roster, so there is
      // nothing to reconcile incrementally.
      return;
    }

    const desired = selectAdoptedPetSimInputs(petsDrivenStateRef.current);
    const desiredIds = new Set(desired.map((pet) => pet.id));
    const records = petsDrivenStateRef.current.pets;

    // This effect owns simulation membership only — never the OS pet windows.
    // The action handlers (showPet / hidePet / deletePet / showAllPets /
    // hideAllPets) already open and close those. Opening or closing them here
    // too double-destroys a WebView2 window that hidePet is already tearing
    // down, which crashes the app with a native access violation.

    // Add pets that became visible.
    for (const pet of desired) {
      if (adoptedPetIdsRef.current.has(pet.id)) {
        continue;
      }
      const record = records.find((candidate) => candidate.id === pet.id);
      const scale = clampPetWindowScale(record?.scale ?? DEFAULT_PET_WINDOW_SCALE);
      const bodySize = adoptedPetBodySize(scale);
      scenario.addPet(pet, { bodySize });
      adoptedPetIdsRef.current.add(pet.id);
      adoptedScaleByPetIdRef.current = {
        ...adoptedScaleByPetIdRef.current,
        [pet.id]: scale,
      };
    }

    // Remove pets that are no longer visible.
    for (const id of [...adoptedPetIdsRef.current]) {
      if (desiredIds.has(id)) {
        continue;
      }
      scenario.removePet(id);
      adoptedPetIdsRef.current.delete(id);
      adoptedLastEmitByPetIdRef.current.delete(id);
      const { [id]: _removedScale, ...restScales } = adoptedScaleByPetIdRef.current;
      adoptedScaleByPetIdRef.current = restScales;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptedSimKey]);

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
      defaultPetSourceFolder={defaultPetSourceFolder}
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
      onReconnectHook={() => void emitClaudeHookTestEvent()}
      onResetPetFolder={() => applyPetSourceFolder(null)}
      onResetPets={() => void resetPets()}
      onSetLaunchCommand={setLaunchCommand}
      onSetLaunchProfile={setLaunchProfile}
      onSetPetPersonality={setPetPersonality}
      onShowAllPets={showAllPets}
      onShowPet={showPet}
      onUpdateSessionCommand={updateSessionCommand}
      petStatusById={petStatusById}
      petWindowError={petWindowError}
      setEditPetId={setEditPetId}
      setMainTab={setMainTab}
      state={petsDrivenState}
      toast={toast}
    />
  );
}
