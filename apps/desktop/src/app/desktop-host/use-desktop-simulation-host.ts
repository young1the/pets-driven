import {
  createAdoptedPetsScenario,
  createDemoScenario,
  deriveAdoptedPetLocomotion,
} from "@pets-driven/pet-engine/core/scenario-fixtures";
import { PLAYGROUND_PET_ENTITY_IDS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { currentMonitor, cursorPosition } from "@tauri-apps/api/window";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import { createAgentEventFromClaudeHook } from "@/adapters/agent-events/claude-hook-adapter";
import { desktopGateway } from "@/app/desktop-gateway";
import { formatCommandError } from "@/app/desktop-host/format-command-error";
import {
  adoptedPetBodySize,
  desktopFixturePetBodySize,
  loadDesktopMonitorWorkAreas,
  loadMainWindowSpawnPoint,
  projectionBoundsForMonitors,
} from "@/app/desktop-host/monitor-geometry";
import { shortWorkingDir } from "@/app/main-window/pet-card-view";
import {
  createPetCardStatusTracker,
  type PetCardStatus,
  petStatusFromSnapshot,
} from "@/app-state/pet-card-status";
import { selectAdoptedPetSimInputs } from "@/app-state/pet-surface";
import {
  type PetsDrivenState,
  resolveRegisteredWorkingDirectoryForCwd,
} from "@/app-state/pets-driven-state";
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

const DESKTOP_FIXTURE_HOST_TICK_MS = 16;
const DESKTOP_FIXTURE_STEP_MS = 16;
// Unchanged frames are still re-emitted twice a second: pet windows
// re-evaluate their held activity label (steadyActivity) only on incoming
// frames, and a window that finishes creating after its first frame was
// emitted must not wait for the next real change to show itself.
const PET_WINDOW_FRAME_HEARTBEAT_TICKS = Math.round(500 / DESKTOP_FIXTURE_HOST_TICK_MS);
// The cursor is a slow stimulus — pets notice it and drift towards it. Sampling
// it every tick cost one shell round trip per frame for a signal that nothing
// reads at that resolution.
const CURSOR_POLL_INTERVAL_MS = 100;

function petWindowPlaygroundLabelForPetId(petId: string) {
  const index = PLAYGROUND_PET_ENTITY_IDS.indexOf(
    petId as (typeof PLAYGROUND_PET_ENTITY_IDS)[number],
  );

  return index >= 0 ? `pet-window-playground-${index + 1}` : null;
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

type UseDesktopSimulationHostParams = {
  /** Live roster state, used to derive the sim rebuild/reconcile triggers. */
  petsDrivenState: PetsDrivenState;
  /** The same state as a ref, read inside the mount-once effects. */
  stateRef: MutableRefObject<PetsDrivenState>;
  applyState: (next: PetsDrivenState) => void;
  setPetWindowError: (message: string | null) => void;
  focusOrStartSessionForPet: (petId: string) => void;
  startSessionForPet: (petId: string) => void;
  connectTerminalForPet: (petId: string) => void;
  unbindPet: (petId: string) => void;
  emitBindingState: (petId: string, isLoading?: boolean, isConnecting?: boolean) => void;
  hidePet: (petId: string) => void;
  pickFolderForPet: (petId: string) => void;
};

/**
 * The desktop Simulation Host: owns the fixture and adopted simulation worlds,
 * steps them on a fixed tick, projects each frame onto its pet overlay window,
 * and routes pet-window pointer/menu input back into the app. Pet-window input
 * that maps to session or roster actions is delegated to the injected handlers.
 */
export function useDesktopSimulationHost({
  petsDrivenState,
  stateRef,
  applyState,
  setPetWindowError,
  focusOrStartSessionForPet,
  startSessionForPet,
  connectTerminalForPet,
  unbindPet,
  emitBindingState,
  hidePet,
  pickFolderForPet,
}: UseDesktopSimulationHostParams) {
  const fixtureScenarioRef = useRef(createDemoScenario());
  const fixtureHostSequenceRef = useRef(0);
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
  const adoptedCursorPolledAtRef = useRef(0);
  const fixtureCursorPhysicalRef = useRef<{ x: number; y: number } | null>(null);
  const fixtureCursorScaleRef = useRef(1);
  const fixtureCursorPolledAtRef = useRef(0);
  // petId -> the placement last handed to the shell, so a pet standing still
  // never re-enters the batch and never moves its OS window.
  const adoptedPlacedByPetIdRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const [desktopFixtureWindowCount] = useState(0);
  const [adoptedSimulationResetKey] = useState(0);
  const [petStatusById, setPetStatusById] = useState<Record<string, PetCardStatus>>({});

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

  // Fan a routed Claude hook event into every live world. Only the pet whose
  // AgentBinding.sourceId matches reacts; the others ignore it. Each world
  // stamps the event with its own clock since they advance independently.
  function pushAgentHookEvent(payload: unknown) {
    try {
      const routedPayload = routeClaudeHookPayloadToRegisteredWorkingDirectory(
        payload,
        stateRef.current,
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
        const current = stateRef.current;
        const memo = input.memo ?? "";
        applyState({
          ...current,
          pets: current.pets.map((p) => (p.id === input.petId ? { ...p, memo } : p)),
        });
        void desktopGateway.updatePet({ petId: input.petId, memo });
        return;
      }
      if (input.kind === "menu.pick-folder") {
        void pickFolderForPet(input.petId);
        return;
      }
      if (input.kind === "body.contextmenu" || input.kind === "overlay.contextmenu") {
        const pet = stateRef.current.pets.find((p) => p.id === input.petId);
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
        const personality = selectAdoptedPetSimInputs(stateRef.current).find(
          (input) => input.id === petId,
        )?.personality;
        const { canWalk, canJump } = deriveAdoptedPetLocomotion(bodySize, personality);
        scenario.world.setComponent(petId, canWalk);
        scenario.world.setComponent(petId, canJump);
      }
      const current = stateRef.current;
      applyState({
        ...current,
        pets: current.pets.map((p) => (p.id === petId ? { ...p, scale: nextScale } : p)),
      });
      void desktopGateway.updatePet({ petId, scale: nextScale });
    }).then((stop) => {
      unlisten = stop;
    });

    return () => unlisten?.();
  }, []);

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
      const fixtureNow = Date.now();
      if (fixtureNow - fixtureCursorPolledAtRef.current >= CURSOR_POLL_INTERVAL_MS) {
        fixtureCursorPolledAtRef.current = fixtureNow;
        void cursorPosition()
          .then((physical) => {
            fixtureCursorPhysicalRef.current = { x: physical.x, y: physical.y };
          })
          .catch(() => {
            fixtureCursorPhysicalRef.current = null;
          });
      }

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

          const petRecord = stateRef.current.pets.find((p) => p.id === projection.petId);
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
  }, [desktopFixtureWindowCount, stateRef.current.pets.find]);

  // Drive the user's adopted pets the same way the fixture host drives the
  // playground: one shared simulation world, projected onto each pet's overlay
  // window. Rebuilds whenever the visible roster changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adoptedHasVisiblePets and adoptedSimulationResetKey are intentional rebuild triggers; the body reads state via refs. Removing them would stop the adopted-pet sim from rebuilding when the roster changes or a reset is requested.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const simInputs = selectAdoptedPetSimInputs(stateRef.current);

    if (simInputs.length === 0) {
      adoptedScenarioRef.current = null;
      adoptedStatusTrackerRef.current = createPetCardStatusTracker();
      adoptedPetIdsRef.current = new Set();
      adoptedLastEmitByPetIdRef.current = new Map();
      adoptedPlacedByPetIdRef.current = new Map();
      return;
    }

    let isActive = true;
    let isBroadcasting = false;

    // Each visible pet needs its overlay window before frames can land.
    for (const pet of simInputs) {
      const record = stateRef.current.pets.find((candidate) => candidate.id === pet.id);

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
      const petRecords = stateRef.current.pets;
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
      adoptedPlacedByPetIdRef.current = new Map();
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
      const tickStartedAt = Date.now();
      if (tickStartedAt - adoptedCursorPolledAtRef.current >= CURSOR_POLL_INTERVAL_MS) {
        adoptedCursorPolledAtRef.current = tickStartedAt;
        void cursorPosition()
          .then((physical) => {
            adoptedCursorPhysicalRef.current = { x: physical.x, y: physical.y };
          })
          .catch(() => {
            adoptedCursorPhysicalRef.current = null;
          });
      }

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

      const pets = stateRef.current.pets;
      const dirs = stateRef.current.registeredWorkingDirectories;
      // Where each pet stands is settled natively in one batch; what each pet
      // looks like is a per-window event. Splitting the two is what keeps a
      // roomful of pets cheap: walking changes position every tick but the
      // sprite only every few hundred milliseconds, so the expensive
      // cross-webview emit now fires on appearance changes alone.
      const placements: { petId: string; x: number; y: number }[] = [];
      const emits: Promise<unknown>[] = [];

      for (const projection of projections) {
        const nextPlacement = {
          x: Math.round(projection.frame.window.x),
          y: Math.round(projection.frame.window.y),
        };
        const placed = adoptedPlacedByPetIdRef.current.get(projection.petId);
        if (!placed || placed.x !== nextPlacement.x || placed.y !== nextPlacement.y) {
          adoptedPlacedByPetIdRef.current.set(projection.petId, nextPlacement);
          placements.push({ petId: projection.petId, ...nextPlacement });
        }

        const petRecord = pets.find((p) => p.id === projection.petId);
        const dirPath = dirs.find((d) => d.petId === projection.petId)?.path ?? null;
        const frame = petRecord
          ? {
              ...projection.frame,
              name: petRecord.name,
              // The window cannot re-read its own URL, so its look travels here.
              assetId: petRecord.assetId,
              cwd: dirPath ? shortWorkingDir(dirPath) : undefined,
            }
          : projection.frame;

        // Position is deliberately excluded from the comparison: the pet window
        // no longer places itself, so a frame that only moved has nothing new
        // to render. Heartbeat re-sends still land twice a second.
        const body = JSON.stringify({
          ...frame,
          sequence: 0,
          window: { width: frame.window.width, height: frame.window.height },
        });
        const lastEmit = adoptedLastEmitByPetIdRef.current.get(projection.petId);
        if (
          lastEmit &&
          lastEmit.body === body &&
          frame.sequence - lastEmit.sequence < PET_WINDOW_FRAME_HEARTBEAT_TICKS
        ) {
          continue;
        }

        adoptedLastEmitByPetIdRef.current.set(projection.petId, {
          body,
          sequence: frame.sequence,
        });
        emits.push(emitTo(`pet-window-${projection.petId}`, PET_WINDOW_FRAME_EVENT, frame));
      }

      if (placements.length > 0) {
        emits.push(
          desktopGateway.placePetWindows(placements).then((unplaced) => {
            // Their overlay window had not finished being created. Forget the
            // placement so the next tick sends it again — otherwise a pet that
            // stands still after being deployed would never be shown at all.
            for (const petId of unplaced) {
              adoptedPlacedByPetIdRef.current.delete(petId);
            }
          }),
        );
      }

      void Promise.all(emits).finally(() => {
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

    const desired = selectAdoptedPetSimInputs(stateRef.current);
    const desiredIds = new Set(desired.map((pet) => pet.id));
    const records = stateRef.current.pets;

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
      adoptedPlacedByPetIdRef.current.delete(id);
      const { [id]: _removedScale, ...restScales } = adoptedScaleByPetIdRef.current;
      adoptedScaleByPetIdRef.current = restScales;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptedSimKey]);

  return { petStatusById, pushAgentHookEvent };
}
