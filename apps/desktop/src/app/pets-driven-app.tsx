import { useEffect, useRef, useState } from "react";
import { Button } from "@pets-driven/design-system";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  availableMonitors,
  currentMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { createAgentEventFromClaudeHook } from "@/adapters/agent-events/claude-hook-adapter";
import {
  CLAUDE_HOOK_INGRESS_EVENT,
  type ClaudeHookIngressStatus,
} from "@/adapters/agent-events/claude-hook-ingress";
import { PETS_DRIVEN_STATE_CHANGED_EVENT } from "@/adapters/agent-events/hatch-ingress";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import { useAppNavigation } from "@/app/app-navigation";
import { desktopGateway, type CodexPetPackage } from "@/app/desktop-gateway";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";
import { MainWindow, type MainWindowTab } from "@/app/main-window/main-window";
import type { PetEditView } from "@/app/main-window/pet-edit-section";
import type { HomePetView } from "@/app/main-window/home-section";
import {
  petStatusFromSnapshot,
  type PetCardStatus,
} from "@/app-state/pet-card-status";
import { personalityRoleLabel } from "@/app/pet-presentation";
import {
  getWorkingDirectoryForPet,
  registerWorkingDirectory,
} from "@/app-state/pet-adoption";
import { withDesktopFixtureWorkingDirectories } from "@/app-state/dev-fixtures";
import {
  createEmptyPetsDrivenState,
  resolveRegisteredWorkingDirectoryForCwd,
  type PetRecord,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import {
  createAdoptedPetsScenario,
  createDemoScenario,
} from "@pets-driven/pet-engine/core/scenario-fixtures";
import {
  getWorldViewport,
  type MonitorWorkArea,
} from "@pets-driven/pet-engine/core/monitor-geometry";
import { selectAdoptedPetSimInputs } from "@/app-state/pet-surface";
import { PLAYGROUND_PET_ENTITY_IDS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { PetWindowView } from "@/pet-window/pet-window-view";
import {
  PET_WINDOW_BINDING_EVENT,
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_RESIZE_EVENT,
  type PetWindowBindingEvent,
  type PetWindowInputEvent,
  type PetWindowResizeEvent,
} from "@/pet-window/pet-window-messages";
import { PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import {
  projectScreenPointToWorld,
  projectWorldSnapshotToPetWindows,
} from "@/pet-window/pet-window-projection";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";
import { PlaygroundApp } from "@/playground/browser/playground-app";

const DESKTOP_FIXTURE_HOST_TICK_MS = 33;
const DESKTOP_FIXTURE_STEP_MS = 16;
const DESKTOP_FIXTURE_WORLD_SIZE = { width: 960, height: 540 };
const CLAUDE_HOOK_STATUS_REFRESH_MS = 2000;

// A foreign OS window a pet is bound to. Mirrors the Rust `ForeignWindow`.
type ForeignWindow = { hwnd: number; title: string };

function formatCommandError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function petWindowRouteParams(): PetWindowRouteParams | null {
  const params = new URLSearchParams(window.location.search);

  if (params.get("surface") !== "pet-window") {
    return null;
  }

  return {
    petId: params.get("petId") || "pet-a",
    assetId: params.get("assetId") || "patamon",
    windowIndex: Number(params.get("windowIndex") || "1"),
  };
}

function petWindowPlaygroundLabelForPetId(petId: string) {
  const index = PLAYGROUND_PET_ENTITY_IDS.indexOf(
    petId as (typeof PLAYGROUND_PET_ENTITY_IDS)[number],
  );

  return index >= 0 ? `pet-window-playground-${index + 1}` : null;
}

function desktopFixturePetBodySize(
  bounds: { width: number; height: number },
  scale = 1,
) {
  const scaleX = bounds.width / DESKTOP_FIXTURE_WORLD_SIZE.width;
  const scaleY = bounds.height / DESKTOP_FIXTURE_WORLD_SIZE.height;

  return {
    width: (PET_WINDOW_LAYOUT.body.width * scale) / scaleX,
    height: (PET_WINDOW_LAYOUT.body.height * scale) / scaleY,
  };
}

// Adopted pets run in a world sized to the real work area, so their projection
// is 1:1 — the physics body must equal the sprite's body rect directly, not be
// divided by the fixture world scale (which left pets half-sunk behind the
// taskbar).
function adoptedPetBodySize(scale = 1) {
  return {
    width: PET_WINDOW_LAYOUT.body.width * scale,
    height: PET_WINDOW_LAYOUT.body.height * scale,
  };
}

function monitorToWorkArea(monitor: Monitor, index: number): MonitorWorkArea {
  const dpi = monitor.scaleFactor;

  return {
    id: monitor.name ?? `monitor-${index + 1}`,
    x: monitor.workArea.position.x / dpi,
    y: monitor.workArea.position.y / dpi,
    width: monitor.workArea.size.width / dpi,
    height: monitor.workArea.size.height / dpi,
  };
}

function projectionBoundsForMonitors(monitors: MonitorWorkArea[]) {
  return getWorldViewport(monitors);
}

async function loadDesktopMonitorWorkAreas(): Promise<MonitorWorkArea[]> {
  try {
    const monitors = await availableMonitors();

    if (monitors.length > 0) {
      return monitors.map(monitorToWorkArea);
    }
  } catch {
    // Fall back to the current monitor below.
  }

  const monitor = await currentMonitor();

  return monitor ? [monitorToWorkArea(monitor, 0)] : [];
}

function createInitialPetsDrivenState(): PetsDrivenState {
  return import.meta.env.DEV
    ? withDesktopFixtureWorkingDirectories(createEmptyPetsDrivenState())
    : createEmptyPetsDrivenState();
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

function defaultClaudeHookIngressStatus(): ClaudeHookIngressStatus {
  return {
    url: "",
    state: isTauri() ? "pending" : "error",
    error: isTauri() ? null : "Claude hook ingress is only available in Tauri.",
  };
}

const PERSONALITY_GRADIENTS: Record<string, { from: string; to: string }> = {
  playful: { from: "#FF7FB4", to: "#F95E9E" },
  attentive: { from: "#5AC8E8", to: "#2F9CC4" },
  reserved: { from: "#A28BF0", to: "#7560D8" },
  curious: { from: "#5BD08A", to: "#2E9E63" },
  steady: { from: "#8B7FE8", to: "#6F5FD6" },
  bold: { from: "#FF7A5C", to: "#E04428" },
};

function petGradient(personalityId: string | undefined) {
  return (
    PERSONALITY_GRADIENTS[personalityId ?? "steady"] ??
    PERSONALITY_GRADIENTS.steady
  );
}

export function PetsDrivenApp() {
  const petWindowPet = petWindowRouteParams();
  const fixtureScenarioRef = useRef(createDemoScenario());
  const fixtureHostSequenceRef = useRef(0);
  const petsDrivenStateRef = useRef(createInitialPetsDrivenState());
  const fixtureHostBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const adoptedScenarioRef = useRef<ReturnType<
    typeof createAdoptedPetsScenario
  > | null>(null);
  const adoptedPetIdsRef = useRef<Set<string>>(new Set());
  // petId -> the window this pet is bound to. In-memory only; HWNDs go stale
  // across restarts, so a dead focus just clears the binding.
  const windowBindingsRef = useRef<Map<string, ForeignWindow>>(new Map());
  const adoptedHostSequenceRef = useRef(0);
  const adoptedScaleByPetIdRef = useRef<Record<string, number>>({});
  const adoptedHostBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const { view, navigate } = useAppNavigation();
  const [petsDrivenState, setPetsDrivenState] = useState<PetsDrivenState>(
    petsDrivenStateRef.current,
  );
  const [desktopFixtureWindowCount, setDesktopFixtureWindowCount] = useState(0);
  const [adoptedSimulationResetKey, setAdoptedSimulationResetKey] = useState(0);
  const [pets, setPets] = useState<CodexPetPackage[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [petWindowError, setPetWindowError] = useState<string | null>(null);
  const [claudeHookIngressStatus, setClaudeHookIngressStatus] =
    useState<ClaudeHookIngressStatus>(defaultClaudeHookIngressStatus);
  const [mainTab, setMainTab] = useState<MainWindowTab>("home");
  const [editPetId, setEditPetId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [petStatusById, setPetStatusById] = useState<
    Record<string, PetCardStatus>
  >({});
  const toastTimerRef = useRef<number | null>(null);

  function applyPetsDrivenState(next: PetsDrivenState) {
    petsDrivenStateRef.current = next;
    setPetsDrivenState(next);
  }

  function flashToast(message: string) {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }

  // Stable signature of the visible pet roster; the adopted-pet host rebuilds
  // its world whenever this changes.
  const adoptedSimKey = petsDrivenState.pets
    .filter((pet) => !pet.archived && pet.visible)
    .map((pet) => `${pet.id}:${pet.assetId}`)
    .sort()
    .join(",");

  useEffect(() => {
    let isMounted = true;

    desktopGateway
      .listPetPackages()
      .then((packages) => {
        if (isMounted) {
          setPets(packages);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (isMounted) {
          setPets([]);
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;

    const loadClaudeHookIngressStatus = () => {
      void invoke<ClaudeHookIngressStatus>("get_claude_hook_ingress_status")
        .then((nextStatus) => {
          if (isMounted) {
            setClaudeHookIngressStatus(nextStatus);
          }
        })
        .catch((error) => {
          if (isMounted) {
            setClaudeHookIngressStatus({
              url: "",
              state: "error",
              error: formatCommandError(error),
            });
          }
        });
    };

    loadClaudeHookIngressStatus();
    const intervalId = window.setInterval(
      loadClaudeHookIngressStatus,
      CLAUDE_HOOK_STATUS_REFRESH_MS,
    );

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    // Chain the unlisten off the promise so React StrictMode's mount/cleanup/
    // remount can't leak a duplicate listener (which double-fired every event).
    const listenPromise = listen<PetWindowInputEvent>(
      PET_WINDOW_INPUT_EVENT,
      (event) => {
        const input = event.payload;

        if (input.kind === "body.focus") {
          void focusBoundWindow(input.petId, input.windowLabel);
          return;
        }
        if (input.kind === "menu.start-session") {
          void startSessionForPet(input.petId, input.windowLabel);
          return;
        }
        if (input.kind === "menu.unbind") {
          unbindPet(input.petId, input.windowLabel);
          return;
        }
        if (input.kind === "menu.request-binding") {
          emitBindingState(input.petId, input.windowLabel);
          return;
        }

        const isAdopted = adoptedPetIdsRef.current.has(input.petId);
        const scenario = isAdopted
          ? adoptedScenarioRef.current
          : fixtureScenarioRef.current;
        const bounds = isAdopted
          ? adoptedHostBoundsRef.current
          : fixtureHostBoundsRef.current;

        if (!scenario || !bounds || !input.kind.startsWith("body.pointer.")) {
          return;
        }

        const snapshot = scenario.world.snapshot();
        scenario.world.pushEvent({
          kind: "pointer",
          type: input.kind.replace("body.", "") as
            | "pointer.down"
            | "pointer.move"
            | "pointer.up",
          pointerId: input.pointerId,
          at: scenario.clock.now(),
          position: projectScreenPointToWorld(
            snapshot,
            bounds,
            input.screenPoint,
          ),
          button: input.button ?? 0,
        });
      },
    );

    return () => {
      void listenPromise.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void listen<PetWindowResizeEvent>(PET_WINDOW_RESIZE_EVENT, (event) => {
      const { petId, scale } = event.payload;
      adoptedScaleByPetIdRef.current = {
        ...adoptedScaleByPetIdRef.current,
        [petId]: scale,
      };
      const current = petsDrivenStateRef.current;
      const next: typeof current = {
        ...current,
        pets: current.pets.map((p) => (p.id === petId ? { ...p, scale } : p)),
      };
      applyPetsDrivenState(next);
      void desktopGateway.writePetsDrivenState(next);
    }).then((stop) => {
      unlisten = stop;
    });

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (petWindowPet) {
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
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void listen<unknown>(CLAUDE_HOOK_INGRESS_EVENT, (event) => {
      try {
        const routedPayload =
          routeClaudeHookPayloadToRegisteredWorkingDirectory(
            event.payload,
            petsDrivenStateRef.current,
          );

        if (!routedPayload) {
          return;
        }

        // Fan the event into every live world. Only the pet whose
        // AgentBinding.sourceId matches reacts; the others ignore it. Each
        // world stamps the event with its own clock since they advance
        // independently.
        for (const scenario of [
          fixtureScenarioRef.current,
          adoptedScenarioRef.current,
        ]) {
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
    }).then((stop) => {
      unlisten = stop;
    });

    return () => unlisten?.();
  }, []);

  // The backend owns the hatch write; when it signals a state change, reload
  // the persisted state so the new pet's window opens and it joins the sim.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void listen(PETS_DRIVEN_STATE_CHANGED_EVENT, () => {
      void desktopGateway
        .readPetsDrivenState()
        .then((state) => {
          applyPetsDrivenState(state);
        })
        .catch((error) => {
          setPetWindowError(formatCommandError(error));
        });
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

          return [emitTo(label, PET_WINDOW_FRAME_EVENT, projection.frame)];
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
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const simInputs = selectAdoptedPetSimInputs(petsDrivenStateRef.current);

    if (simInputs.length === 0) {
      adoptedScenarioRef.current = null;
      adoptedPetIdsRef.current = new Set();
      return;
    }

    let isActive = true;
    let isBroadcasting = false;

    // Each visible pet needs its overlay window before frames can land.
    for (const pet of simInputs) {
      const record = petsDrivenStateRef.current.pets.find(
        (candidate) => candidate.id === pet.id,
      );

      if (record) {
        void desktopGateway
          .openAdoptedPetWindow(record.id, record.assetId)
          .catch(() => {});
      }
    }

    void loadDesktopMonitorWorkAreas().then((monitors) => {
      if (!isActive || monitors.length === 0) {
        return;
      }

      const bounds = projectionBoundsForMonitors(monitors);
      adoptedHostBoundsRef.current = bounds;
      const petRecords = petsDrivenStateRef.current.pets;
      const petBodySizeByPetId: Record<
        string,
        { width: number; height: number }
      > = {};
      const scaleByPetId: Record<string, number> = {};
      for (const pet of simInputs) {
        const record = petRecords.find((r) => r.id === pet.id);
        const scale = record?.scale ?? 1;
        scaleByPetId[pet.id] = scale;
        petBodySizeByPetId[pet.id] = adoptedPetBodySize(scale);
      }
      adoptedScenarioRef.current = createAdoptedPetsScenario(simInputs, {
        petBodySizeByPetId,
        monitors,
      });
      adoptedPetIdsRef.current = new Set(simInputs.map((pet) => pet.id));
      adoptedHostSequenceRef.current = 0;
      adoptedScaleByPetIdRef.current = scaleByPetId;
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

      scenario.clock.advanceBy(DESKTOP_FIXTURE_STEP_MS);
      scenario.world.step(DESKTOP_FIXTURE_STEP_MS);
      adoptedHostSequenceRef.current += 1;

      const snapshot = scenario.world.snapshot();

      const nextStatuses: Record<string, PetCardStatus> = {};
      for (const petSnapshot of snapshot.pets) {
        nextStatuses[petSnapshot.id] = petStatusFromSnapshot(petSnapshot);
      }
      setPetStatusById((current) => {
        const sameKeys =
          Object.keys(current).length === Object.keys(nextStatuses).length &&
          Object.keys(nextStatuses).every(
            (id) => current[id]?.label === nextStatuses[id]?.label,
          );
        return sameKeys ? current : nextStatuses;
      });

      const projections = projectWorldSnapshotToPetWindows(
        snapshot,
        bounds,
        adoptedHostSequenceRef.current,
        adoptedScaleByPetIdRef.current,
      );

      void Promise.all(
        projections.map((projection) =>
          emitTo(
            `pet-window-${projection.petId}`,
            PET_WINDOW_FRAME_EVENT,
            projection.frame,
          ),
        ),
      ).finally(() => {
        isBroadcasting = false;
      });
    }, DESKTOP_FIXTURE_HOST_TICK_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptedSimKey, adoptedSimulationResetKey]);

  if (petWindowPet) {
    return <PetWindowView pet={petWindowPet} />;
  }

  if (view === "playground") {
    return (
      <div className="app-playground-view">
        <Button
          className="app-back-button"
          onClick={() => navigate("home")}
          size="sm"
          variant="neutral"
        >
          Back
        </Button>
        <PlaygroundApp />
      </div>
    );
  }

  if (view === "onboarding") {
    return (
      <OnboardingFlow
        onDone={() => navigate("home")}
        onStateChange={applyPetsDrivenState}
        state={petsDrivenState}
      />
    );
  }

  async function invokePetWindowCommand(command: string, count?: number) {
    setPetWindowError(null);

    try {
      if (count === undefined) {
        await invoke(command);
      } else {
        await invoke(command, { count });
      }

      if (command === "open_pet_window_playground") {
        setDesktopFixtureWindowCount(count ?? 1);
      } else if (command === "close_pet_window_playground") {
        setDesktopFixtureWindowCount(0);
      }
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  async function emitClaudeHookTestEvent() {
    setPetWindowError(null);

    try {
      await invoke("emit_test_claude_hook_ingress_event");
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  function cwdForPet(petId: string): string | null {
    const directory =
      petsDrivenStateRef.current.registeredWorkingDirectories.find(
        (candidate) => candidate.petId === petId,
      );
    return directory ? directory.path : null;
  }

  // Push the pet's current binding (title or null) to its window so its badge,
  // menu, and bubble stay in sync with what the host actually holds.
  function emitBindingState(
    petId: string,
    windowLabel: string,
    isLoading = false,
  ) {
    const binding = windowBindingsRef.current.get(petId) ?? null;
    void emitTo(windowLabel, PET_WINDOW_BINDING_EVENT, {
      petId,
      title: binding ? binding.title : null,
      isLoading,
    } satisfies PetWindowBindingEvent);
  }

  function setBinding(
    petId: string,
    windowLabel: string,
    window: ForeignWindow | null,
  ) {
    if (window) {
      windowBindingsRef.current.set(petId, window);
    } else {
      windowBindingsRef.current.delete(petId);
    }
    emitBindingState(petId, windowLabel);
  }

  // Double-click: focus the bound window. A dead binding is cleared so the UI
  // stops claiming a window that's gone.
  async function focusBoundWindow(petId: string, windowLabel: string) {
    const binding = windowBindingsRef.current.get(petId);
    if (!binding) {
      return;
    }
    try {
      if (await invoke<boolean>("focus_window", { hwnd: binding.hwnd })) {
        return;
      }
    } catch {
      // Window vanished.
    }
    setBinding(petId, windowLabel, null);
  }

  // Start a session and auto-bind to the window it launches.
  async function startSessionForPet(petId: string, windowLabel: string) {
    const cwd = cwdForPet(petId);
    if (!cwd) {
      emitBindingState(petId, windowLabel);
      return;
    }
    emitBindingState(petId, windowLabel, true);
    try {
      const launched = await invoke<ForeignWindow | null>("start_session", {
        cwd,
        command: petsDrivenStateRef.current.sessionCommand,
      });
      if (launched) {
        setBinding(petId, windowLabel, launched);
      } else {
        emitBindingState(petId, windowLabel);
      }
    } catch (error) {
      emitBindingState(petId, windowLabel);
      setPetWindowError(formatCommandError(error));
    }
  }

  function unbindPet(petId: string, windowLabel: string) {
    setBinding(petId, windowLabel, null);
  }

  // Fire a real hook event at the first adopted pet's folder so the full
  // ingress → routing → adopted world path can be verified visually.
  async function pokeFirstPet() {
    setPetWindowError(null);

    const directory =
      petsDrivenStateRef.current.registeredWorkingDirectories.find(
        (candidate) =>
          petsDrivenStateRef.current.pets.some(
            (pet) => pet.id === candidate.petId && !pet.archived && pet.visible,
          ),
      );

    if (!directory) {
      setPetWindowError("No adopted pet with a folder to poke.");
      return;
    }

    try {
      await invoke("emit_test_claude_hook_ingress_event", {
        cwd: directory.path,
      });
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  async function resetPets() {
    setPetWindowError(null);

    const empty = createEmptyPetsDrivenState();

    try {
      await invoke("close_all_pet_windows");
      await desktopGateway.writePetsDrivenState(empty);
      applyPetsDrivenState(empty);
      navigate("onboarding");
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  async function openAllPets() {
    setPetWindowError(null);

    const visiblePets = petsDrivenStateRef.current.pets.filter(
      (pet) => !pet.archived && pet.visible,
    );

    try {
      await Promise.all(
        visiblePets.map((pet) =>
          desktopGateway.openAdoptedPetWindow(pet.id, pet.assetId),
        ),
      );
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  async function closeAllPets() {
    setPetWindowError(null);

    try {
      await invoke("close_all_pet_windows");
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  function resetAdoptedSimulation() {
    setPetWindowError(null);
    setAdoptedSimulationResetKey((key) => key + 1);
  }

  function updateSessionCommand(command: string) {
    const next = { ...petsDrivenStateRef.current, sessionCommand: command };
    applyPetsDrivenState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  function patchPet(petId: string, patch: Partial<PetRecord>) {
    const current = petsDrivenStateRef.current;
    const next: PetsDrivenState = {
      ...current,
      pets: current.pets.map((pet) =>
        pet.id === petId ? { ...pet, ...patch } : pet,
      ),
    };
    applyPetsDrivenState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  function deployPet(petId: string) {
    const pet = petsDrivenStateRef.current.pets.find((p) => p.id === petId);
    patchPet(petId, { visible: true });
    void desktopGateway
      .openAdoptedPetWindow(petId, pet?.assetId ?? "")
      .catch(() => {});
    if (pet) {
      flashToast(`${pet.name} is on the desktop`);
    }
  }

  function recallPet(petId: string) {
    const pet = petsDrivenStateRef.current.pets.find((p) => p.id === petId);
    patchPet(petId, { visible: false });
    if (pet) {
      flashToast(`${pet.name} came home`);
    }
  }

  function deployAllPets() {
    for (const pet of petsDrivenStateRef.current.pets.filter(
      (p) => !p.archived,
    )) {
      patchPet(pet.id, { visible: true });
      void desktopGateway
        .openAdoptedPetWindow(pet.id, pet.assetId)
        .catch(() => {});
    }
  }

  function recallAllPets() {
    const current = petsDrivenStateRef.current;
    const next: PetsDrivenState = {
      ...current,
      pets: current.pets.map((pet) => ({ ...pet, visible: false })),
    };
    applyPetsDrivenState(next);
    void desktopGateway.writePetsDrivenState(next);
  }

  function deletePet(petId: string) {
    const pet = petsDrivenStateRef.current.pets.find((p) => p.id === petId);
    if (
      !pet ||
      !window.confirm(`Send ${pet.name} home for good? This removes the pet.`)
    ) {
      return;
    }
    patchPet(petId, { archived: true, visible: false });
    setEditPetId(null);
    flashToast(`${pet.name} was removed`);
  }

  async function pickFolderForPet(petId: string) {
    const path = await desktopGateway.pickDirectory();
    if (!path) {
      return;
    }
    const result = registerWorkingDirectory(petsDrivenStateRef.current, {
      petId,
      path,
      workingDirectoryId: crypto.randomUUID(),
      agentSourceId: crypto.randomUUID(),
      now: Date.now(),
    });
    if (result.status === "occupied") {
      flashToast("That folder already belongs to another pet");
      return;
    }
    applyPetsDrivenState(result.state);
    void desktopGateway.writePetsDrivenState(result.state);
  }

  function setSessionShell(shell: string) {
    const command = petsDrivenStateRef.current.sessionCommand;
    if (shell === "cmd" && !command.startsWith("cmd")) {
      updateSessionCommand(
        `cmd /k ${command.replace(/^bash\s+-lc\s+/, "")}`.trim(),
      );
    } else if (shell === "bash" && command.startsWith("cmd")) {
      updateSessionCommand(command.replace(/^cmd\s+\/k\s+/, "").trim());
    }
  }

  // Build the view models MainWindow needs from petsDrivenState.
  const managedPets = petsDrivenState.pets.filter((pet) => !pet.archived);
  const profileFor = (pet: (typeof managedPets)[number]) =>
    petsDrivenState.petProfiles.find((profile) => profile.id === pet.profileId);
  const statusFor = (petId: string): PetCardStatus =>
    petStatusById[petId] ?? {
      label: "Idle",
      tone: "neutral",
      dotColor: "var(--ink-300)",
    };

  const atHome: HomePetView[] = managedPets
    .filter((pet) => !pet.visible)
    .map((pet) => {
      const personalityId = profileFor(pet)?.personalityId;
      return {
        id: pet.id,
        name: pet.name,
        assetId: pet.assetId,
        role: personalityRoleLabel(personalityId),
        status: statusFor(pet.id),
        gradient: petGradient(personalityId),
      };
    });

  const inField = managedPets
    .filter((pet) => pet.visible)
    .map((pet) => ({
      id: pet.id,
      name: pet.name,
      color: petGradient(profileFor(pet)?.personalityId).from,
    }));

  const editingPet = managedPets.find((pet) => pet.id === editPetId) ?? null;
  const editPetView: PetEditView | null = editingPet
    ? {
        id: editingPet.id,
        name: editingPet.name,
        assetId: editingPet.assetId,
        role: personalityRoleLabel(profileFor(editingPet)?.personalityId),
        status: statusFor(editingPet.id),
        gradient: petGradient(profileFor(editingPet)?.personalityId),
        folder:
          getWorkingDirectoryForPet(petsDrivenState, editingPet.id)?.path ?? "",
        memo: editingPet.memo ?? "",
        deployed: editingPet.visible,
      }
    : null;

  const previewPet = managedPets[0];
  const previewDir = previewPet
    ? (getWorkingDirectoryForPet(petsDrivenState, previewPet.id)?.path ??
      "core")
    : "core";
  const shellPrompt = petsDrivenState.sessionCommand.startsWith("cmd")
    ? "C:\\>"
    : "$";
  const detectedShell = petsDrivenState.sessionCommand.startsWith("cmd")
    ? "cmd"
    : "bash";

  return (
    <MainWindow
      debug={{
        error: petWindowError,
        groups: [
          {
            title: "Pets",
            hint: "adoption & state",
            items: [
              { label: "Adopt a pet", onClick: () => navigate("onboarding") },
              { label: "Reset pets", onClick: () => void resetPets() },
              { label: "Show all pets", onClick: () => void openAllPets() },
              { label: "Close all pets", onClick: () => void closeAllPets() },
            ],
          },
          {
            title: "Simulation",
            hint: "world & playground",
            items: [
              { label: "Reset simulation", onClick: resetAdoptedSimulation },
              {
                label: "Open playground",
                onClick: () => navigate("playground"),
              },
            ],
          },
          {
            title: "Pet windows",
            hint: "overlay fixtures",
            items: [
              {
                label: "Open pet window",
                onClick: () =>
                  void invokePetWindowCommand("open_pet_window_playground", 1),
              },
              {
                label: "Open 3 pet windows",
                onClick: () =>
                  void invokePetWindowCommand("open_pet_window_playground", 3),
              },
              {
                label: "Open fixture windows",
                onClick: () =>
                  void invokePetWindowCommand("open_pet_window_playground", 7),
              },
              {
                label: "Close pet windows",
                onClick: () =>
                  void invokePetWindowCommand("close_pet_window_playground"),
              },
            ],
          },
          {
            title: "Claude hook",
            hint: "ingress testing",
            items: [
              {
                label: "Test event",
                onClick: () => void emitClaudeHookTestEvent(),
              },
              { label: "Poke pet", onClick: () => void pokeFirstPet() },
            ],
          },
        ],
      }}
      edit={{
        onName: (value) => editPetId && patchPet(editPetId, { name: value }),
        onMemo: (value) => editPetId && patchPet(editPetId, { memo: value }),
        onPickFolder: () => editPetId && void pickFolderForPet(editPetId),
        onToggleDeployed: () =>
          editPetId &&
          (editingPet?.visible ? recallPet(editPetId) : deployPet(editPetId)),
        onDelete: () => editPetId && deletePet(editPetId),
        onDone: () => setEditPetId(null),
      }}
      editPet={editPetView}
      home={{
        atHome,
        inField,
        onDeploy: deployPet,
        onRecall: recallPet,
        onEdit: (petId) => setEditPetId(petId),
        onAddPet: () => navigate("onboarding"),
        onShowAll: deployAllPets,
        onHideAll: recallAllPets,
      }}
      onTab={(next) => {
        setEditPetId(null);
        setMainTab(next);
      }}
      settings={{
        shell: detectedShell,
        command: petsDrivenState.sessionCommand,
        onShell: setSessionShell,
        onCommand: updateSessionCommand,
        confirmRun: true,
        onToggleConfirm: () => {},
        preview: {
          cwd: (detectedShell === "cmd" ? "C:\\pets\\" : "~/") + previewDir,
          prompt: shellPrompt,
          command: petsDrivenState.sessionCommand,
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
              ? "All connected"
              : claudeHookIngressStatus.state === "pending"
                ? "Connecting"
                : "Offline",
          summary: `Claude hook ${claudeHookIngressStatus.state}`,
          url: claudeHookIngressStatus.url,
        },
        onReconnect: () => void emitClaudeHookTestEvent(),
      }}
      tab={mainTab}
      toast={toast}
    />
  );
}
