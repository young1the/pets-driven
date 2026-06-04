import { useEffect, useRef, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { currentMonitor } from "@tauri-apps/api/window";
import { createDemoScenario } from "@/core/scenario-fixtures";
import {
  CODEX_PET_ASSETS,
  PLAYGROUND_PET_ENTITY_IDS,
} from "@/pets/assets/codex-pet-fixtures";
import { PetWindowView } from "@/pet-window/pet-window-view";
import {
  isSamePetWindowPresentation,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_POSITION_EVENT,
  PET_WINDOW_PRESENTATION_EVENT,
  type PetWindowInputEvent,
  type PetWindowPresentationUpdate,
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

export function PetsDrivenApp() {
  const petWindowPet = petWindowRouteParams();
  const fixtureScenarioRef = useRef(createDemoScenario());
  const fixtureHostSequenceRef = useRef(0);
  const fixturePresentationCacheRef = useRef(
    new Map<string, PetWindowPresentationUpdate>(),
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
      fixturePresentationCacheRef.current.clear();
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

          const events = [
            emitTo(label, PET_WINDOW_POSITION_EVENT, projection.position),
          ];
          const previousPresentation =
            fixturePresentationCacheRef.current.get(projection.petId);
          if (
            !previousPresentation ||
            !isSamePetWindowPresentation(
              previousPresentation,
              projection.presentation,
            )
          ) {
            fixturePresentationCacheRef.current.set(
              projection.petId,
              projection.presentation,
            );
            events.push(
              emitTo(
                label,
                PET_WINDOW_PRESENTATION_EVENT,
                projection.presentation,
              ),
            );
          }

          return events;
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
        <button
          className="app-back-button"
          type="button"
          onClick={() => setViewMode("home")}
        >
          Back
        </button>
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
        fixturePresentationCacheRef.current.clear();
        setDesktopFixtureWindowCount(0);
      }
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
          <button type="button" onClick={() => setViewMode("playground")}>
            Open playground
          </button>
          <button
            type="button"
            onClick={() =>
              void invokePetWindowCommand("open_pet_window_playground", 1)
            }
          >
            Open pet window
          </button>
          <button
            type="button"
            onClick={() =>
              void invokePetWindowCommand("open_pet_window_playground", 3)
            }
          >
            Open 3 pet windows
          </button>
          <button
            type="button"
            onClick={() =>
              void invokePetWindowCommand("open_pet_window_playground", 7)
            }
          >
            Open fixture pet windows
          </button>
          <button
            type="button"
            onClick={() => void invokePetWindowCommand("close_pet_window_playground")}
          >
            Close pet windows
          </button>
        </div>
      </header>

      {petWindowError ? (
        <p className="app-error" role="status">
          {petWindowError}
        </p>
      ) : null}

      <section className="app-summary" aria-label="Runtime summary">
        <div>
          <span>Packages</span>
          <strong>{pets.length}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{isTauri() ? "Tauri" : "Browser"}</strong>
        </div>
      </section>

      <section className="app-pets" aria-labelledby="pet-packages-title">
        <div className="app-section-header">
          <h2 id="pet-packages-title">Pet packages</h2>
          <span>{status}</span>
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
