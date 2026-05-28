import { useEffect, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { CODEX_PET_ASSETS } from "@/pets/assets/codex-pet-fixtures";
import { PlaygroundApp } from "@/playground/browser/playground-app";

type CodexPetPackage = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

type ViewMode = "home" | "playground";

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
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [pets, setPets] = useState<CodexPetPackage[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Pets Driven</h1>
          <p>Codex pet runtime</p>
        </div>
        <button type="button" onClick={() => setViewMode("playground")}>
          Open playground
        </button>
      </header>

      <section className="app-summary" aria-label="Runtime summary">
        <div>
          <span>Packages</span>
          <strong>{pets.length}</strong>
        </div>
        <div>
          <span>Renderer</span>
          <strong>9-row atlas</strong>
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
