import { useEffect, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { CODEX_PET_ASSETS } from "@/pets/assets/codex-pet-fixtures";
import { PetWindowView } from "@/pet-window/pet-window-view";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";
import { PlaygroundApp } from "@/playground/browser/playground-app";

type CodexPetPackage = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

type ViewMode = "home" | "playground";

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

export function PetsDrivenApp() {
  const petWindowPet = petWindowRouteParams();
  const [viewMode, setViewMode] = useState<ViewMode>("home");
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
              void invokePetWindowCommand("open_pet_window_playground", 5)
            }
          >
            Open 5 pet windows
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
