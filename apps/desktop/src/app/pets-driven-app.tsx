import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "@pets-driven/design-system";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { currentMonitor } from "@tauri-apps/api/window";
import { createAgentEventFromClaudeHook } from "@/adapters/agent-events/claude-hook-adapter";
import {
  CLAUDE_HOOK_INGRESS_EVENT,
  type ClaudeHookIngressStatus,
} from "@/adapters/agent-events/claude-hook-ingress";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import { useAppNavigation } from "@/app/app-navigation";
import { desktopGateway, type CodexPetPackage } from "@/app/desktop-gateway";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";
import { withDesktopFixtureWorkingDirectories } from "@/app-state/dev-fixtures";
import {
  createEmptyPetsDrivenState,
  resolveRegisteredWorkingDirectoryForCwd,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import {
  createAdoptedPetsScenario,
  createDemoScenario,
} from "@pets-driven/pet-engine/core/scenario-fixtures";
import { selectAdoptedPetSimInputs } from "@/app-state/pet-surface";
import { PLAYGROUND_PET_ENTITY_IDS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { PetWindowView } from "@/pet-window/pet-window-view";
import {
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_INPUT_EVENT,
  type PetWindowInputEvent,
} from "@/pet-window/pet-window-messages";
import { PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import { projectWorldSnapshotToPetWindows } from "@/pet-window/pet-window-projection";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";
import { PlaygroundApp } from "@/playground/browser/playground-app";

const DESKTOP_FIXTURE_HOST_TICK_MS = 33;
const DESKTOP_FIXTURE_STEP_MS = 16;
const DESKTOP_FIXTURE_WORLD_SIZE = { width: 960, height: 540 };
const CLAUDE_HOOK_STATUS_REFRESH_MS = 2000;

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

function desktopFixturePetBodySize(bounds: { width: number; height: number }) {
  const scaleX = bounds.width / DESKTOP_FIXTURE_WORLD_SIZE.width;
  const scaleY = bounds.height / DESKTOP_FIXTURE_WORLD_SIZE.height;

  return {
    width: PET_WINDOW_LAYOUT.body.width / scaleX,
    height: PET_WINDOW_LAYOUT.body.height / scaleY,
  };
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
  const adoptedHostSequenceRef = useRef(0);
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
  const [pets, setPets] = useState<CodexPetPackage[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [petWindowError, setPetWindowError] = useState<string | null>(null);
  const [claudeHookIngressStatus, setClaudeHookIngressStatus] =
    useState<ClaudeHookIngressStatus>(defaultClaudeHookIngressStatus);

  function applyPetsDrivenState(next: PetsDrivenState) {
    petsDrivenStateRef.current = next;
    setPetsDrivenState(next);
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

    let unlisten: (() => void) | undefined;

    void listen<PetWindowInputEvent>(PET_WINDOW_INPUT_EVENT, (event) => {
      const input = event.payload;
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
      const scaleX = bounds.width / snapshot.width;
      const scaleY = bounds.height / snapshot.height;
      scenario.world.pushEvent({
        kind: "pointer",
        type: input.kind.replace("body.", "") as
          | "pointer.down"
          | "pointer.move"
          | "pointer.up",
        pointerId: input.pointerId,
        at: scenario.clock.now(),
        position: {
          x: (input.screenPoint.x - bounds.x) / scaleX,
          y: (input.screenPoint.y - bounds.y) / scaleY,
        },
        button: input.button ?? 0,
      });
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

      fixtureHostBoundsRef.current = {
        x: monitor.workArea.position.x,
        y: monitor.workArea.position.y,
        width: monitor.workArea.size.width,
        height: monitor.workArea.size.height,
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
          .openPetWindow(record.id, record.assetId)
          .catch(() => {});
      }
    }

    void currentMonitor().then((monitor) => {
      if (!isActive || !monitor) {
        return;
      }

      const bounds = {
        x: monitor.workArea.position.x,
        y: monitor.workArea.position.y,
        width: monitor.workArea.size.width,
        height: monitor.workArea.size.height,
      };
      adoptedHostBoundsRef.current = bounds;
      adoptedScenarioRef.current = createAdoptedPetsScenario(simInputs, {
        petBodySize: desktopFixturePetBodySize(bounds),
      });
      adoptedPetIdsRef.current = new Set(simInputs.map((pet) => pet.id));
      adoptedHostSequenceRef.current = 0;
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

      const projections = projectWorldSnapshotToPetWindows(
        scenario.world.snapshot(),
        bounds,
        adoptedHostSequenceRef.current,
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
  }, [adoptedSimKey]);

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

  if (view === "pets" || view === "connect") {
    return (
      <main className="app-shell">
        <Card padding="lg">
          <h1>{view === "pets" ? "Your pets" : "Connect an agent"}</h1>
          <p>
            <Badge tone="info">Coming soon</Badge>
          </p>
          <Button onClick={() => navigate("home")} size="sm" variant="neutral">
            Back
          </Button>
        </Card>
      </main>
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

  async function closeAllPets() {
    setPetWindowError(null);

    try {
      await invoke("close_all_pet_windows");
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  async function showAllPets() {
    setPetWindowError(null);

    const visiblePets = petsDrivenStateRef.current.pets.filter(
      (pet) => !pet.archived && pet.visible,
    );

    try {
      await Promise.all(
        visiblePets.map((pet) =>
          desktopGateway.openPetWindow(pet.id, pet.assetId),
        ),
      );
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Pets Driven</h1>
          <p>Codex pet runtime</p>
        </div>
        <div className="app-header-actions">
          <Button onClick={() => navigate("onboarding")} size="sm">
            Adopt a pet
          </Button>
          <Button onClick={() => void resetPets()} size="sm" variant="ghost">
            Reset pets
          </Button>
          <Button onClick={() => void showAllPets()} size="sm" variant="accent">
            Show all pets
          </Button>
          <Button onClick={() => void closeAllPets()} size="sm" variant="ghost">
            Close all pets
          </Button>
          <Button
            onClick={() => navigate("playground")}
            size="sm"
            variant="neutral"
          >
            Open playground
          </Button>
          <Button
            onClick={() =>
              void invokePetWindowCommand("open_pet_window_playground", 1)
            }
            size="sm"
            variant="accent"
          >
            Open pet window
          </Button>
          <Button
            onClick={() =>
              void invokePetWindowCommand("open_pet_window_playground", 3)
            }
            size="sm"
            variant="neutral"
          >
            Open 3 pet windows
          </Button>
          <Button
            onClick={() =>
              void invokePetWindowCommand("open_pet_window_playground", 7)
            }
            size="sm"
            variant="neutral"
          >
            Open fixture pet windows
          </Button>
          <Button
            onClick={() =>
              void invokePetWindowCommand("close_pet_window_playground")
            }
            size="sm"
            variant="ghost"
          >
            Close pet windows
          </Button>
        </div>
      </header>

      {petWindowError ? (
        <p className="app-error" role="status">
          {petWindowError}
        </p>
      ) : null}

      <section className="app-summary" aria-label="Runtime summary">
        <Card padding="sm">
          <span>Packages</span>
          <strong>{pets.length}</strong>
        </Card>
        <Card padding="sm">
          <span>Source</span>
          <strong>{isTauri() ? "Tauri" : "Browser"}</strong>
        </Card>
        <Card className="app-summary-runtime" padding="sm">
          <span>Claude hook</span>
          <strong data-testid="claude-hook-state">
            {claudeHookIngressStatus.state}
          </strong>
          <code data-testid="claude-hook-url">
            {claudeHookIngressStatus.url || "unavailable"}
          </code>
          <Button
            aria-label="Send Claude hook test event"
            onClick={() => void emitClaudeHookTestEvent()}
            size="sm"
            variant="neutral"
          >
            Test event
          </Button>
          <Button
            aria-label="Poke the first adopted pet"
            onClick={() => void pokeFirstPet()}
            size="sm"
            variant="accent"
          >
            Poke pet
          </Button>
          {claudeHookIngressStatus.error ? (
            <small>{claudeHookIngressStatus.error}</small>
          ) : null}
        </Card>
      </section>

      <section className="app-pets" aria-labelledby="pet-packages-title">
        <div className="app-section-header">
          <h2 id="pet-packages-title">Pet packages</h2>
          <Badge
            dot
            tone={
              status === "ready"
                ? "success"
                : status === "loading"
                  ? "info"
                  : "danger"
            }
          >
            {status}
          </Badge>
        </div>
        <ul>
          {pets.map((pet) => (
            <li key={pet.id}>
              <strong>{pet.displayName}</strong>
              <span>{pet.id}</span>
              <p>{pet.description}</p>
            </li>
          ))}
          {pets.length === 0 && status !== "loading" ? (
            <li>
              <strong>No packages found</strong>
              <span>fallback enabled</span>
              <p>Bundled Patamon spritesheet will be used for rendering.</p>
            </li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}
