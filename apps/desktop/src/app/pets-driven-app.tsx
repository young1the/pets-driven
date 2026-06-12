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
import {
  createEmptyPetsDrivenState,
  parsePetsDrivenState,
  resolveRegisteredWorkingDirectoryForCwd,
  withDesktopFixtureWorkingDirectories,
  type PetsDrivenStateV1,
} from "@/app-state/pets-driven-state";
import { createDemoScenario } from "@/core/scenario-fixtures";
import {
  CODEX_PET_ASSETS,
  PLAYGROUND_PET_ENTITY_IDS,
} from "@/pets/assets/codex-pet-fixtures";
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

type CodexPetPackage = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

type ViewMode = "home" | "playground";
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

async function loadCodexPetPackages(): Promise<CodexPetPackage[]> {
  if (isTauri()) {
    return await invoke<CodexPetPackage[]>("list_codex_pet_packages");
  }

  return CODEX_PET_ASSETS.map((asset) => ({
    id: asset.id,
    displayName: asset.displayName,
    description: asset.description,
    spritesheetPath: asset.spritesheetPath,
  }));
}

function petWindowPlaygroundLabelForPetId(petId: string) {
  const index = PLAYGROUND_PET_ENTITY_IDS.indexOf(
    petId as (typeof PLAYGROUND_PET_ENTITY_IDS)[number],
  );

  return index >= 0 ? `pet-window-playground-${index + 1}` : null;
}

function desktopFixturePetBodySize(bounds: {
  width: number;
  height: number;
}) {
  const scaleX = bounds.width / DESKTOP_FIXTURE_WORLD_SIZE.width;
  const scaleY = bounds.height / DESKTOP_FIXTURE_WORLD_SIZE.height;

  return {
    width: PET_WINDOW_LAYOUT.body.width / scaleX,
    height: PET_WINDOW_LAYOUT.body.height / scaleY,
  };
}

function routeClaudeHookPayloadToRegisteredWorkingDirectory(
  payload: unknown,
  state: PetsDrivenStateV1,
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
  const petsDrivenStateRef = useRef(
    withDesktopFixtureWorkingDirectories(createEmptyPetsDrivenState()),
  );
  const fixtureHostBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [desktopFixtureWindowCount, setDesktopFixtureWindowCount] = useState(0);
  const [pets, setPets] = useState<CodexPetPackage[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [petWindowError, setPetWindowError] = useState<string | null>(null);
  const [claudeHookIngressStatus, setClaudeHookIngressStatus] =
    useState<ClaudeHookIngressStatus>(defaultClaudeHookIngressStatus);

  useEffect(() => {
    let isMounted = true;

    loadCodexPetPackages()
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
      const bounds = fixtureHostBoundsRef.current;
      const snapshot = fixtureScenarioRef.current.world.snapshot();

      if (!bounds || !input.kind.startsWith("body.pointer.")) {
        return;
      }

      const scaleX = bounds.width / snapshot.width;
      const scaleY = bounds.height / snapshot.height;
      fixtureScenarioRef.current.world.pushEvent({
        kind: "pointer",
        type: input.kind.replace("body.", "") as
          | "pointer.down"
          | "pointer.move"
          | "pointer.up",
        pointerId: input.pointerId,
        at: fixtureScenarioRef.current.clock.now(),
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
    if (!isTauri()) {
      return;
    }

    let isMounted = true;

    void invoke<unknown>("read_pets_driven_state")
      .then((state) => {
        if (!isMounted) {
          return;
        }

        petsDrivenStateRef.current = withDesktopFixtureWorkingDirectories(
          parsePetsDrivenState(state),
        );
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
        const routedPayload = routeClaudeHookPayloadToRegisteredWorkingDirectory(
          event.payload,
          petsDrivenStateRef.current,
        );

        if (!routedPayload) {
          return;
        }

        const agentEvent = createAgentEventFromClaudeHook(routedPayload, {
          defaultSourceId: "agent-a",
          now: fixtureScenarioRef.current.clock.now(),
        });

        fixtureScenarioRef.current.world.pushEvent(toWorldEvent(agentEvent));
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

  if (petWindowPet) {
    return <PetWindowView pet={petWindowPet} />;
  }

  if (viewMode === "playground") {
    return (
      <div className="app-playground-view">
        <Button
          className="app-back-button"
          onClick={() => setViewMode("home")}
          size="sm"
          variant="neutral"
        >
          Back
        </Button>
        <PlaygroundApp />
      </div>
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Pets Driven</h1>
          <p>Codex pet runtime</p>
        </div>
        <div className="app-header-actions">
          <Button onClick={() => setViewMode("playground")} size="sm">
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
