import {
  createAdoptedPetsScenario,
  createDemoScenario,
  deriveAdoptedPetLocomotion,
} from "@pets-driven/pet-engine/core/scenario-fixtures";
import type { WorldPropKind } from "@pets-driven/pet-engine/features/props/components";
import { PLAYGROUND_PET_ENTITY_IDS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { availableMonitors, currentMonitor, cursorPosition } from "@tauri-apps/api/window";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import { createAgentEventFromHook } from "@/adapters/agent-events/agent-hook-adapter";
import type { AgentHookIngressEvent } from "@/adapters/agent-events/agent-hook-ingress";
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
import type { PetOverlayMode } from "@/app/pet-overlay-mode";
import type { QuietMode } from "@/app/quiet-mode";
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
import {
  isPetOverlayInteractive,
  PET_OVERLAY_FRAME_EVENT,
  PET_OVERLAY_LABEL,
  type PetOverlayFrame,
  petOverlayWindowRect,
} from "@/pet-window/pet-overlay-messages";
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
  projectWorldItemsToWindows,
  projectWorldPropsToWindows,
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
// Except in single-window overlay mode, where the cursor is also the input: it
// is the only thing that tells the host whether the overlay may take the mouse
// at all, and at 100ms a click on a pet you just walked the pointer onto would
// be dropped. It replaces the per-pet placement batch that mode does not send,
// so the tick is not paying twice.
const OVERLAY_CURSOR_POLL_INTERVAL_MS = DESKTOP_FIXTURE_HOST_TICK_MS;
// How long the overlay keeps the mouse on a gesture's word alone. A drag or a
// resize carries the cursor off the pet, so the surface says when it starts and
// when it ends — but a missed release must not leave a desktop-wide window
// swallowing clicks, so the claim expires on its own.
const PET_OVERLAY_CAPTURE_MAX_MS = 20_000;

function petWindowPlaygroundLabelForPetId(petId: string) {
  const index = PLAYGROUND_PET_ENTITY_IDS.indexOf(
    petId as (typeof PLAYGROUND_PET_ENTITY_IDS)[number],
  );

  return index >= 0 ? `pet-window-playground-${index + 1}` : null;
}

function routeAgentHookToRegisteredWorkingDirectory(
  event: AgentHookIngressEvent,
  state: PetsDrivenState,
): AgentHookIngressEvent | null {
  const { payload } = event;
  if (!payload || typeof payload !== "object") {
    return event;
  }

  const cwd = (payload as { cwd?: unknown }).cwd;

  if (typeof cwd !== "string" || cwd.trim().length === 0) {
    return event;
  }

  const workingDirectory = resolveRegisteredWorkingDirectoryForCwd(state, cwd);

  if (!workingDirectory) {
    return null;
  }

  return {
    ...event,
    payload: {
      ...payload,
      sourceId: workingDirectory.agentSourceId,
    },
  };
}

/** How many of each non-pet entity the desktop is currently holding. */
export type DesktopObjectCounts = {
  /** Uncollected trinkets. They fade on their own, so this falls back to zero. */
  treats: number;
  /** Props. Nothing sweeps these away — they stay until the user clears them. */
  props: number;
};

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
  /** Whether the pets get one OS window each or share one desktop-wide overlay. */
  overlayMode: PetOverlayMode;
  /** How much the pets may intrude: off, quiet (no chatter), still (no moving). */
  quietMode: QuietMode;
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
  overlayMode,
  quietMode,
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
  // The trinket and prop overlays the shell is currently showing, as one
  // comparable key. A trinket never moves once it lands, so it contributes a
  // change only on a drop, a pickup or a fade. The ball does move, but only
  // while it is actually rolling — a kick costs a second or two of per-tick
  // reconciles (each one a native set_position on an existing window, not a
  // rebuild) and then the key goes quiet again until something touches it.
  const adoptedItemWindowKeyRef = useRef<string>("");
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
  // Single-window overlay mode. The last roster emitted, so a wholly idle tick
  // skips the emit like the per-pet path does; whether the overlay currently
  // has the mouse, which is hysteresis state and must survive the tick; and
  // when a gesture's claim on it runs out.
  const adoptedLastOverlayEmitRef = useRef<{ body: string; sequence: number } | null>(null);
  const petOverlayInteractiveRef = useRef(false);
  const petOverlayCaptureUntilRef = useRef(0);
  // Quiet Mode, as a ref: the tick loop is mounted once and would otherwise
  // close over the level the user had when their pets were deployed. Kept out
  // of the rebuild triggers on purpose — the world is handed the live value
  // each tick instead, so quieting the pets never moves them.
  const quietModeRef = useRef(quietMode);
  quietModeRef.current = quietMode;

  const [desktopFixtureWindowCount] = useState(0);
  const [adoptedSimulationResetKey] = useState(0);
  const [petStatusById, setPetStatusById] = useState<Record<string, PetCardStatus>>({});
  // How many non-pet entities are on the desktop, for the place dialog's "N on
  // the desktop" lines. Set from the tick loop but only when a count actually
  // changes, so an idle desktop re-renders the main window no more than a still
  // pet does — the numbers move on a drop, a pickup, a fade or a placement, not
  // sixty times a second.
  const [desktopObjectCounts, setDesktopObjectCounts] = useState<DesktopObjectCounts>({
    treats: 0,
    props: 0,
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

  // Hand-drop a random trinket onto the desktop floor, in place of the
  // automatic ItemSpawner cadence (switched off in the adopted scenario). The
  // main window's treat button calls this; the next tick's snapshot picks
  // up the new WorldItem and syncItemWindows spawns its overlay. Returns whether
  // a trinket actually landed — false when no world is live (no pets on the
  // desktop yet) or there was nowhere to place one.
  function dropTreat(): boolean {
    const scenario = adoptedScenarioRef.current;
    if (!scenario) {
      return false;
    }
    try {
      return scenario.world.dropRandomItem() !== null;
    } catch (error) {
      setPetWindowError(formatCommandError(error));
      return false;
    }
  }

  // Put one prop on the desktop floor. Unlike a trinket it has no lifetime, so
  // nothing takes it away again — clearProps is the only way out, which is why
  // the two are offered side by side in the place dialog.
  function placeProp(kind: WorldPropKind): boolean {
    const scenario = adoptedScenarioRef.current;
    if (!scenario) {
      return false;
    }
    try {
      return scenario.world.spawnProp(kind) !== null;
    } catch (error) {
      setPetWindowError(formatCommandError(error));
      return false;
    }
  }

  // Take every prop off the desktop. Their overlay windows go on the next
  // tick's reconcile, the same way a collected trinket's does — no separate
  // teardown, because the window set is derived from the world, not tracked.
  function clearProps(): void {
    const scenario = adoptedScenarioRef.current;
    if (!scenario) {
      return;
    }
    try {
      for (const id of scenario.world.propIds()) {
        scenario.world.removeEntity(id);
      }
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  // Fan a routed agent hook event into every live world. Only the pet whose
  // AgentBinding.sourceId matches reacts; the others ignore it. Each world
  // stamps the event with its own clock since they advance independently.
  function pushAgentHookEvent(event: AgentHookIngressEvent) {
    try {
      const routedEvent = routeAgentHookToRegisteredWorkingDirectory(event, stateRef.current);

      if (!routedEvent) {
        return;
      }

      for (const scenario of [fixtureScenarioRef.current, adoptedScenarioRef.current]) {
        if (!scenario) {
          continue;
        }

        const agentEvent = createAgentEventFromHook(routedEvent, {
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

      if (input.kind === "surface.capture.start" || input.kind === "surface.capture.end") {
        petOverlayCaptureUntilRef.current =
          input.kind === "surface.capture.start" ? Date.now() + PET_OVERLAY_CAPTURE_MAX_MS : 0;
        return;
      }
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
        const note = input.note ?? "";
        applyState({
          ...current,
          pets: current.pets.map((p) => (p.id === input.petId ? { ...p, note } : p)),
        });
        void desktopGateway.updatePet({ petId: input.petId, note });
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
            pet?.note ?? "",
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
      if (input.kind === "menu.game-toggle" || input.kind === "menu.game-practice") {
        // One session for the whole desktop, so this is a toggle and not an
        // "add": picking a second pet means that one instead, and picking the
        // same row on the pet already running means stop. Picking the *other*
        // row switches what the course is made of without restarting anything
        // the user would notice.
        const scenario = adoptedScenarioRef.current;
        if (!scenario) return;

        const spawn = input.kind === "menu.game-practice" ? "auto" : "tool-use";
        const session = scenario.world.gameSession();
        if (session?.petId === input.petId && session.spawn === spawn) {
          scenario.world.endGame();
        } else {
          scenario.world.startGame(input.petId, { spawn });
        }
        return;
      }

      // A prop only ever exists in the adopted world, and is never in the pet
      // roster the lookup below asks — so it says which world it is in rather
      // than being mistaken for a fixture pet.
      const isAdopted = input.entity === "prop" || adoptedPetIdsRef.current.has(input.petId);
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
        // Which entity was pressed is not something this host should be working
        // out. Every surface that sends `body.pointer.*` stands for exactly one
        // entity and has already decided the press was on it, in its own
        // coordinate space where the answer is exact — a pet surface classifies
        // the point against its own body rect, a prop window against its own
        // ball. Passing that through means the engine never has to rediscover
        // it from a projected coordinate, which is the one part of this path
        // that can drift.
        entityId: input.petId || undefined,
      });

      // Diagnostic for the open placement drift (see apps/desktop/AGENTS.md).
      // Dragging no longer depends on the world→screen round trip being an
      // identity, but it still is not one, and nothing else can see across this
      // boundary: the host knows where it *asked* for a window to go, only the
      // window knows where it *is*, and the monitors' scale factors say whether
      // the two spaces can agree at all. The Debug tab is the one roomy surface
      // to write that on. Delete this once the drift is explained.
      if (input.entity === "prop" && input.kind === "body.pointer.down") {
        const prop = snapshot.props?.find((entry) => entry.id === input.petId);
        const placed = projectWorldPropsToWindows(snapshot, bounds).find(
          (entry) => entry.itemId === input.petId,
        );
        const at = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
        void availableMonitors()
          .then((monitors) =>
            monitors
              .map(
                (m) =>
                  `${m.name ?? "?"} s=${m.scaleFactor} pos=${m.position.x},${m.position.y} work=${m.workArea.position.x},${m.workArea.position.y} ${m.workArea.size.width}x${m.workArea.size.height}`,
              )
              .join(" ;; "),
          )
          .catch(() => "monitors unavailable")
          .then((monitorLine) => {
            setPetWindowError(
              [
                `press screen=${at(input.screenPoint)} local=${at(input.localPoint)}`,
                `ball=${prop ? at(prop.position) : "?"}`,
                `askedFor=${placed ? at(placed) : "?"}`,
                input.note ?? "no window note",
                `bounds=${at(bounds)} ${Math.round(bounds.width)}x${Math.round(bounds.height)}`,
                `monitors: ${monitorLine}`,
              ].join(" | "),
            );
          });
      }
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

  // Leaving a mode takes its windows with it. Declared ahead of the world
  // lifecycle below so a switch closes the old surface before the new one is
  // opened, and idempotent — on the first run the other mode has nothing open,
  // and both commands no-op on a window that does not exist.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    if (overlayMode === "single-window") {
      void desktopGateway.closeAllPetWindows().catch(() => {});
      return;
    }

    petOverlayInteractiveRef.current = false;
    petOverlayCaptureUntilRef.current = 0;
    adoptedLastOverlayEmitRef.current = null;
    void desktopGateway.closePetOverlayWindow().catch(() => {});
  }, [overlayMode]);

  // Drive the user's adopted pets the same way the fixture host drives the
  // playground: one shared simulation world, projected onto each pet's overlay
  // window. Rebuilds whenever the visible roster changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adoptedHasVisiblePets, adoptedSimulationResetKey and overlayMode are intentional rebuild triggers; the body reads state via refs. Removing them would stop the adopted-pet sim from rebuilding when the roster changes, a reset is requested, or the pets move to a different kind of window.
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
      // The overlay is drawn from the frames alone, and with no world left
      // there is no tick to send an empty one — so the last pets home would
      // otherwise stay painted on the desktop. A pet window closes with its
      // pet; the shared one closes with the last of them.
      if (overlayMode === "single-window") {
        adoptedLastOverlayEmitRef.current = null;
        petOverlayInteractiveRef.current = false;
        petOverlayCaptureUntilRef.current = 0;
        void desktopGateway.closePetOverlayWindow().catch(() => {});
      }

      // No world means no trinkets; leaving their overlays up would strand
      // glowing squares on an otherwise empty desktop.
      adoptedItemWindowKeyRef.current = "";
      void desktopGateway.closeAllItemWindows().catch(() => {});
      return;
    }

    let isActive = true;
    let isBroadcasting = false;

    // Each visible pet needs its overlay window before frames can land — unless
    // they share one, which is opened below, once the bounds it covers are known.
    if (overlayMode === "window-per-pet") {
      for (const pet of simInputs) {
        const record = stateRef.current.pets.find((candidate) => candidate.id === pet.id);

        if (record) {
          void desktopGateway.openAdoptedPetWindow(record.id, record.assetId).catch(() => {});
        }
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

      if (overlayMode === "single-window") {
        // Also the re-fit when the monitor layout changed under a running app:
        // this runs on every world rebuild, and the command sizes an overlay
        // that already exists rather than making a second one.
        adoptedLastOverlayEmitRef.current = null;
        void desktopGateway.openPetOverlayWindow(petOverlayWindowRect(bounds)).catch(() => {});
      }
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
      const cursorPollIntervalMs =
        overlayMode === "single-window" ? OVERLAY_CURSOR_POLL_INTERVAL_MS : CURSOR_POLL_INTERVAL_MS;
      if (tickStartedAt - adoptedCursorPolledAtRef.current >= cursorPollIntervalMs) {
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

      // Handed over per tick rather than watched by an effect: the tick already
      // reads this ref, the world may have been rebuilt since the setting last
      // changed, and a level the user picked must not wait on a rebuild — or
      // cause one, which would send every pet back to its spawn point.
      scenario.world.setQuietMode(quietModeRef.current);

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

      const pets = stateRef.current.pets;
      const dirs = stateRef.current.registeredWorkingDirectories;
      // Read off the roster each tick rather than cached in a ref like the
      // scale map: nothing else has to be resized to follow it, so the toggle
      // in the edit screen simply lands on the next frame.
      const swapRunningByPetId: Record<string, boolean> = {};
      for (const pet of pets) {
        if (pet.swapRunningDirections) {
          swapRunningByPetId[pet.id] = true;
        }
      }

      const projections = projectWorldSnapshotToPetWindows(
        snapshot,
        bounds,
        adoptedHostSequenceRef.current,
        adoptedScaleByPetIdRef.current,
        swapRunningByPetId,
      );

      // Everything the window has to know that the simulation does not own: the
      // pet's name, its current look, its folder and its note. The overlay
      // surfaces cannot re-read their own URL, so these ride the frames.
      const frames = projections.map((projection) => {
        const petRecord = pets.find((p) => p.id === projection.petId);

        if (!petRecord) {
          return projection.frame;
        }

        const dirPath = dirs.find((d) => d.petId === projection.petId)?.path ?? null;

        return {
          ...projection.frame,
          name: petRecord.name,
          assetId: petRecord.assetId,
          cwd: dirPath ? shortWorkingDir(dirPath) : undefined,
          // Always a string so clearing a note reaches the window as an empty
          // value rather than an absent key the window would ignore.
          note: petRecord.note ?? "",
          // The one line the window says on its own, so the engine's silence
          // cannot cover it: while the pets are quiet, a note only speaks when
          // the user has just saved one.
          quiet: quietModeRef.current !== "off",
        };
      });

      const emits: Promise<unknown>[] = [];

      if (overlayMode === "single-window") {
        // One window, so one message: position travels with appearance instead
        // of going to the shell separately, and the tick costs the same whether
        // one pet is out or twenty. Position is therefore *in* the comparison
        // here — a frame that only moved is the whole point of sending it.
        const body = JSON.stringify(frames.map((frame) => ({ ...frame, sequence: 0 })));
        const lastEmit = adoptedLastOverlayEmitRef.current;
        const isUnchanged =
          lastEmit !== null &&
          lastEmit.body === body &&
          adoptedHostSequenceRef.current - lastEmit.sequence < PET_WINDOW_FRAME_HEARTBEAT_TICKS;

        if (!isUnchanged) {
          adoptedLastOverlayEmitRef.current = {
            body,
            sequence: adoptedHostSequenceRef.current,
          };
          emits.push(
            emitTo(PET_OVERLAY_LABEL, PET_OVERLAY_FRAME_EVENT, {
              schemaVersion: 1,
              sequence: adoptedHostSequenceRef.current,
              bounds: petOverlayWindowRect(bounds),
              pets: frames,
            } satisfies PetOverlayFrame),
          );
        }

        // The overlay covers the desktop, so it may only take the mouse while
        // the cursor is actually on a pet — or while a gesture that started on
        // one is still holding it. Nothing inside that window can answer this:
        // while it is click-through it is never told the pointer moved.
        const cursorLogical = cursorPhysical
          ? {
              x: cursorPhysical.x / (adoptedCursorScaleRef.current || 1),
              y: cursorPhysical.y / (adoptedCursorScaleRef.current || 1),
            }
          : null;
        const isCaptured = tickStartedAt < petOverlayCaptureUntilRef.current;
        const nextInteractive =
          isCaptured ||
          isPetOverlayInteractive(frames, cursorLogical, petOverlayInteractiveRef.current);

        if (nextInteractive !== petOverlayInteractiveRef.current) {
          petOverlayInteractiveRef.current = nextInteractive;
          emits.push(desktopGateway.setPetOverlayInteractive(nextInteractive).catch(() => {}));
        }
      } else {
        // Where each pet stands is settled natively in one batch; what each pet
        // looks like is a per-window event. Splitting the two is what keeps a
        // roomful of pets cheap: walking changes position every tick but the
        // sprite only every few hundred milliseconds, so the expensive
        // cross-webview emit now fires on appearance changes alone.
        const placements: { petId: string; x: number; y: number }[] = [];

        for (const frame of frames) {
          const nextPlacement = {
            x: Math.round(frame.window.x),
            y: Math.round(frame.window.y),
          };
          const placed = adoptedPlacedByPetIdRef.current.get(frame.petId);
          if (!placed || placed.x !== nextPlacement.x || placed.y !== nextPlacement.y) {
            adoptedPlacedByPetIdRef.current.set(frame.petId, nextPlacement);
            placements.push({ petId: frame.petId, ...nextPlacement });
          }

          // Position is deliberately excluded from the comparison: the pet
          // window no longer places itself, so a frame that only moved has
          // nothing new to render. Heartbeat re-sends still land twice a second.
          const body = JSON.stringify({
            ...frame,
            sequence: 0,
            window: { width: frame.window.width, height: frame.window.height },
          });
          const lastEmit = adoptedLastEmitByPetIdRef.current.get(frame.petId);
          if (
            lastEmit &&
            lastEmit.body === body &&
            frame.sequence - lastEmit.sequence < PET_WINDOW_FRAME_HEARTBEAT_TICKS
          ) {
            continue;
          }

          adoptedLastEmitByPetIdRef.current.set(frame.petId, {
            body,
            sequence: frame.sequence,
          });
          emits.push(emitTo(`pet-window-${frame.petId}`, PET_WINDOW_FRAME_EVENT, frame));
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
      }

      // A trinket keeps its own tiny window in either mode — it is not drawn
      // into the shared overlay — so this reconcile sits outside the split. The
      // ball rides the same set: it is the same kind of thing on screen, one
      // glyph in one tiny always-on-top square.
      const itemPlacements = [
        ...projectWorldItemsToWindows(snapshot, bounds),
        ...projectWorldPropsToWindows(snapshot, bounds),
      ];

      const treats = snapshot.items?.length ?? 0;
      const props = snapshot.props?.length ?? 0;
      setDesktopObjectCounts((current) =>
        current.treats === treats && current.props === props ? current : { treats, props },
      );
      const itemWindowKey = itemPlacements
        .map((item) => `${item.itemId}:${item.kind}:${item.x}:${item.y}`)
        .join("|");
      if (itemWindowKey !== adoptedItemWindowKeyRef.current) {
        adoptedItemWindowKeyRef.current = itemWindowKey;
        emits.push(
          desktopGateway.syncItemWindows(itemPlacements).catch(() => {
            // A failed reconcile must not leave the cache claiming the shell is
            // already showing this set, or the drop would never appear.
            adoptedItemWindowKeyRef.current = "";
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
      // The world is rebuilt from scratch on the next pass, so whatever was
      // lying on the floor is gone with it — the overlays must go too.
      adoptedItemWindowKeyRef.current = "";
      void desktopGateway.closeAllItemWindows().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptedHasVisiblePets, adoptedSimulationResetKey, overlayMode]);

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

  return {
    petStatusById,
    pushAgentHookEvent,
    dropTreat,
    placeProp,
    clearProps,
    desktopObjectCounts,
  };
}
