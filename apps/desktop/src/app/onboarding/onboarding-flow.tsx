import { useEffect, useRef, useState } from "react";
import { Button } from "@pets-driven/design-system";
import wordmarkUrl from "@pets-driven/design-system/assets/petsdriven-wordmark.svg";
import {
  desktopGateway,
  type CodexPetPackage,
  type DesktopGateway,
} from "@/app/desktop-gateway";
import {
  PERSONALITY_OPTIONS,
  type PersonalityOption,
} from "@/app/onboarding/personality-options";
import { PetPackageGrid } from "@/app/onboarding/pet-package-grid";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";
import { adoptPet, registerWorkingDirectory } from "@/app-state/pet-adoption";
import {
  normalizeWorkingDirectoryPath,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

const PET_NAME_MAX_LENGTH = 24;
const TOTAL_STEPS = 6;
const PETDEX_URL = "https://petdex.dev";
// ponytail: the `connect` CLI is still forthcoming, so this command text is
// guidance only. The "listening" indicator below is wired to the real Claude
// hook ingress, so the flow detects a genuine first signal regardless.
const CONNECT_COMMAND_PREFIX = "npx pets-driven connect";

type OnboardingStep = "welcome" | "choose" | "profile" | "folder" | "done";

type BornPet = {
  id: string;
  name: string;
  assetId: string;
  personalityTitle: string;
  folderPath: string;
};

type OnboardingFlowProps = {
  state: PetsDrivenState;
  onStateChange: (state: PetsDrivenState) => void;
  onDone: () => void;
  gateway?: DesktopGateway;
};

function isValidPetName(name: string) {
  const trimmed = name.trim();

  return trimmed.length > 0 && trimmed.length <= PET_NAME_MAX_LENGTH;
}

function comparablePath(path: string) {
  return normalizeWorkingDirectoryPath(path).toLowerCase();
}

function folderName(path: string) {
  const normalized = normalizeWorkingDirectoryPath(path);
  const parts = normalized.split(/[\\/]/);

  return parts[parts.length - 1] || normalized;
}

function useAnimationClock() {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    let isActive = true;
    let frame = 0;

    const tick = (next: number) => {
      if (!isActive) {
        return;
      }

      setElapsedMs(next);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      isActive = false;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return elapsedMs;
}

function PetPreview({ assetId, scale }: { assetId: string; scale: number }) {
  const spritesheetUrl = usePetSpritesheetUrl(assetId);
  const elapsedMs = useAnimationClock();

  return spritesheetUrl ? (
    <PetSprite
      alt="Your pet"
      elapsedMs={elapsedMs}
      imageUrl={spritesheetUrl}
      intent={{ kind: "idle" }}
      scale={scale}
      showStatusBubble={false}
      size={PET_CELL_SIZE}
    />
  ) : null;
}

function StepHeader({
  step,
  total,
  onExit,
}: {
  step: number;
  total: number;
  onExit: () => void;
}) {
  return (
    <header className="pd-onb__top">
      <button
        aria-label="Go to home"
        className="pd-onb__wordmark-btn"
        onClick={onExit}
        type="button"
      >
        <img alt="Pets-Driven" className="pd-onb__wordmark" src={wordmarkUrl} />
      </button>
      <div className="pd-onb__steps">
        <div aria-hidden className="pd-onb__dots-row">
          {Array.from({ length: total }, (_, index) => (
            <span
              className={`pd-onb__step-dot${index < step ? " pd-onb__step-dot--on" : ""}`}
              key={index}
            />
          ))}
        </div>
        <span className="pd-onb__step-label">
          Step {step} / {total}
        </span>
      </div>
      <button
        aria-label="Exit onboarding"
        className="pd-onb__exit"
        onClick={onExit}
        type="button"
      >
        ✕
      </button>
    </header>
  );
}

export function OnboardingFlow({
  state,
  onStateChange,
  onDone,
  gateway = desktopGateway,
}: OnboardingFlowProps) {
  // Welcome is an intro shown only to first-time users; once any pet exists the
  // flow starts at "choose". Frozen per run so the step count stays stable even
  // after this run adopts a pet.
  const [includeWelcome] = useState(() => state.pets.length === 0);
  const [step, setStep] = useState<OnboardingStep>(() =>
    state.pets.length === 0 ? "welcome" : "choose",
  );
  const [packages, setPackages] = useState<CodexPetPackage[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [personalityId, setPersonalityId] =
    useState<PetPersonalityId>("playful");
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(
    null,
  );
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [bornPet, setBornPet] = useState<BornPet | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let isMounted = true;

    void gateway
      .listPetPackages()
      .then((next) => isMounted && setPackages(next))
      .catch(() => isMounted && setPackages([]));

    return () => {
      isMounted = false;
    };
  }, [gateway]);

  const selectedPackage = packages.find((pet) => pet.id === assetId) ?? null;
  const personality =
    PERSONALITY_OPTIONS.find((option) => option.id === personalityId) ??
    PERSONALITY_OPTIONS[0];

  function goToProfile() {
    if (name.trim().length === 0 && selectedPackage) {
      setName(selectedPackage.displayName);
    }

    setStep("profile");
  }

  async function browseFolder() {
    const picked = await gateway.pickDirectory();

    if (picked) {
      setSelectedFolderPath(picked);
      setAdoptionError(null);
    }
  }

  async function completeBirth() {
    if (!assetId || !isValidPetName(name) || !selectedFolderPath) {
      return;
    }

    const petId = crypto.randomUUID();
    const trimmedName = name.trim();
    const adopted = adoptPet(stateRef.current, {
      id: petId,
      profileId: crypto.randomUUID(),
      name: trimmedName,
      assetId,
      personalityId: personality.id,
      personality: personality.factory(),
      now: Date.now(),
    });
    const result = registerWorkingDirectory(adopted, {
      petId,
      path: selectedFolderPath,
      workingDirectoryId: crypto.randomUUID(),
      agentSourceId: crypto.randomUUID(),
      now: Date.now(),
    });

    if (result.status === "occupied") {
      const owner = stateRef.current.pets.find(
        (pet) => pet.id === result.ownerPetId,
      );
      setAdoptionError(
        `That folder is already home to ${owner?.name ?? "another pet"}. One pet watches one folder.`,
      );
      return;
    }

    setAdoptionError(null);

    // The pet is born at home, not thrown straight onto the desktop — the user
    // deploys it from the main window when they're ready.
    const homeState: PetsDrivenState = {
      ...result.state,
      pets: result.state.pets.map((pet) =>
        pet.id === petId ? { ...pet, visible: false } : pet,
      ),
    };

    try {
      await gateway.writePetsDrivenState(homeState);
      onStateChange(homeState);
      setBornPet({
        id: petId,
        name: trimmedName,
        assetId,
        personalityTitle: personality.title,
        folderPath: normalizeWorkingDirectoryPath(selectedFolderPath),
      });
      setStep("done");
    } catch (error) {
      setAdoptionError(error instanceof Error ? error.message : String(error));
    }
  }

  function restartForAnotherPet() {
    setAssetId(null);
    setName("");
    setPersonalityId("playful");
    setSelectedFolderPath(null);
    setBornPet(null);
    setAdoptionError(null);
    // A pet exists by now, so skip the first-time welcome.
    setStep("choose");
  }

  const stepOrder: OnboardingStep[] = includeWelcome
    ? ["welcome", "choose", "profile", "folder", "done"]
    : ["choose", "profile", "folder", "done"];
  const totalSteps = stepOrder.length;
  const stepNumber = stepOrder.indexOf(step) + 1;

  return (
    <main aria-label="Pet onboarding" className="pd-onb">
      <div aria-hidden className="pd-onb__dots" />
      <StepHeader onExit={onDone} step={stepNumber} total={totalSteps} />

      {step === "welcome" && (
        <section className="pd-onb__body pd-onb__welcome">
          <span className="pd-onb__eyebrow">Welcome to Pets-Driven</span>
          <h1 className="pd-onb__title pd-onb__title--hero">
            Let&apos;s bring home your first pet.
          </h1>
          <p className="pd-onb__lede">
            In about a minute you&apos;ll have a desktop pet that perks up
            whenever an agent works in your project. Pick its look, name it, and
            point it at a folder.
          </p>
          <div className="pd-onb__footer">
            <span className="pd-onb__fineprint">
              Takes about a minute · nothing leaves your machine
            </span>
            <Button onClick={() => setStep("choose")} size="lg">
              Get started →
            </Button>
          </div>
        </section>
      )}

      {step === "choose" && (
        <section className="pd-onb__body">
          <span className="pd-onb__eyebrow">Choose a look</span>
          {packages.length > 0 ? (
            <>
              <h1 className="pd-onb__title">Who&apos;s joining the pack?</h1>
              <p className="pd-onb__lede">
                These are the looks installed on this machine — you can fetch
                more anytime.
              </p>
              <PetPackageGrid
                onSelect={setAssetId}
                packages={packages}
                selectedAssetId={assetId}
              />
              <div className="pd-onb__petdex-cta">
                <span>Want more looks? Install pets from Petdex.</span>
                <a href={PETDEX_URL} rel="noreferrer" target="_blank">
                  Open Petdex
                </a>
              </div>
            </>
          ) : (
            <div className="pd-onb__empty">
              <h1 className="pd-onb__title">No pet looks installed yet.</h1>
              <p className="pd-onb__lede">
                We couldn&apos;t find any pet packs on this machine. Install one
                from Petdex, then come back and choose it here.
              </p>
              <div className="pd-onb__petdex-empty">
                <code>npx petdex install boba</code>
                <a href={PETDEX_URL} rel="noreferrer" target="_blank">
                  Browse Petdex
                </a>
              </div>
              <span className="pd-onb__paw" aria-hidden>
                🐾
              </span>
            </div>
          )}
          <div className="pd-onb__footer">
            <Button onClick={() => setStep("welcome")} variant="ghost">
              ← Back
            </Button>
            <Button disabled={!assetId} onClick={goToProfile} size="lg">
              Continue →
            </Button>
          </div>
        </section>
      )}

      {step === "profile" && (
        <section className="pd-onb__body pd-onb__profile">
          <div className="pd-onb__profile-form">
            <span className="pd-onb__eyebrow">Name &amp; personality</span>
            <h1 className="pd-onb__title">Say hello to your pet.</h1>

            <label className="pd-onb__label" htmlFor="pd-onb-name">
              Pet name
            </label>
            <div className="pd-onb__name">
              <input
                className="pd-onb__name-input"
                id="pd-onb-name"
                maxLength={PET_NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder="Otto"
                value={name}
              />
              <span className="pd-onb__name-count">
                {name.trim().length} / {PET_NAME_MAX_LENGTH}
              </span>
            </div>

            <div className="pd-onb__label">Personality</div>
            <div className="pd-onb__pills" role="radiogroup">
              {PERSONALITY_OPTIONS.map((option: PersonalityOption) => (
                <button
                  aria-checked={personalityId === option.id}
                  className={`pd-onb__pill${personalityId === option.id ? " pd-onb__pill--on" : ""}`}
                  key={option.id}
                  onClick={() => setPersonalityId(option.id)}
                  role="radio"
                  type="button"
                >
                  {option.title}
                </button>
              ))}
            </div>
            <p className="pd-onb__hint">{personality.blurb}</p>
          </div>

          <aside className="pd-onb__preview">
            {selectedPackage && (
              <PetPreview assetId={selectedPackage.id} scale={1.3} />
            )}
            <div className="pd-onb__preview-name">
              {name.trim() || "Your pet"}
            </div>
            <div className="pd-onb__preview-meta">
              {personality.title}
              {selectedPackage ? ` · ${selectedPackage.displayName}` : ""}
            </div>
          </aside>

          <div className="pd-onb__footer">
            <Button onClick={() => setStep("choose")} variant="ghost">
              ← Back
            </Button>
            <Button
              disabled={!isValidPetName(name)}
              onClick={() => setStep("folder")}
              size="lg"
            >
              Looks good →
            </Button>
          </div>
        </section>
      )}

      {step === "folder" && (
        <section className="pd-onb__body">
          <span className="pd-onb__eyebrow">Watch folder</span>
          <h1 className="pd-onb__title">
            Which folder should {name.trim() || "your pet"} watch?
          </h1>
          <p className="pd-onb__lede">
            Registering a folder is the moment your pet comes to life. One pet
            watches one folder.
          </p>

          <div className="pd-onb__folders">
            {state.registeredWorkingDirectories.map((directory) => {
              const owner = state.pets.find(
                (pet) => pet.id === directory.petId,
              );
              const occupied = Boolean(owner) && owner?.id !== bornPet?.id;
              const selected =
                selectedFolderPath != null &&
                comparablePath(selectedFolderPath) ===
                  comparablePath(directory.path);

              return (
                <button
                  aria-pressed={selected}
                  className={`pd-onb__folder${selected ? " pd-onb__folder--selected" : ""}${occupied ? " pd-onb__folder--occupied" : ""}`}
                  disabled={occupied}
                  key={directory.id}
                  onClick={() => {
                    setSelectedFolderPath(directory.path);
                    setAdoptionError(null);
                  }}
                  type="button"
                >
                  <span className="pd-onb__folder-icon" aria-hidden>
                    📁
                  </span>
                  <span className="pd-onb__folder-text">
                    <b>{folderName(directory.path)}</b>
                    <small>{directory.path}</small>
                  </span>
                  {occupied ? (
                    <span className="pd-onb__folder-badge">
                      {owner?.name} watches this
                    </span>
                  ) : selected ? (
                    <span className="pd-onb__folder-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}

            {selectedFolderPath &&
              !state.registeredWorkingDirectories.some(
                (directory) =>
                  comparablePath(directory.path) ===
                  comparablePath(selectedFolderPath),
              ) && (
                <div className="pd-onb__folder pd-onb__folder--selected">
                  <span className="pd-onb__folder-icon" aria-hidden>
                    📁
                  </span>
                  <span className="pd-onb__folder-text">
                    <b>{folderName(selectedFolderPath)}</b>
                    <small>{selectedFolderPath}</small>
                  </span>
                  <span className="pd-onb__folder-check" aria-hidden>
                    ✓
                  </span>
                </div>
              )}

            <button
              className="pd-onb__folder pd-onb__folder--browse"
              onClick={() => void browseFolder()}
              type="button"
            >
              <span className="pd-onb__folder-icon" aria-hidden>
                ＋
              </span>
              <span className="pd-onb__folder-text">
                <b>Choose another folder…</b>
                <small>Browse your machine, or create a new one</small>
              </span>
            </button>
          </div>

          {adoptionError && (
            <p className="app-error" role="status">
              {adoptionError}
            </p>
          )}

          <div className="pd-onb__footer">
            <Button onClick={() => setStep("profile")} variant="ghost">
              ← Back
            </Button>
            <Button
              disabled={!selectedFolderPath}
              onClick={() => void completeBirth()}
              size="lg"
            >
              Adopt into this folder →
            </Button>
          </div>
        </section>
      )}

      {step === "done" && bornPet && (
        <section className="pd-onb__body pd-onb__done">
          <div className="pd-onb__done-pet">
            <PetPreview assetId={bornPet.assetId} scale={1.1} />
          </div>
          <span className="pd-onb__eyebrow">{bornPet.name} is home</span>
          <h1 className="pd-onb__title pd-onb__title--hero">
            Resting until you deploy.
          </h1>

          <div className="pd-onb__summary">
            <div className="pd-onb__summary-row">
              <span>Pet</span>
              <strong>
                {bornPet.name} · {bornPet.personalityTitle}
              </strong>
            </div>
            <div className="pd-onb__summary-row">
              <span>Watches</span>
              <strong>{bornPet.folderPath}</strong>
            </div>
            <div className="pd-onb__summary-row">
              <span>Reacts to</span>
              <strong>Your coding agent — starts, finishes, gets stuck</strong>
            </div>
          </div>

          <div className="pd-onb__done-actions">
            <Button onClick={onDone} size="lg">
              Open Pets-Driven →
            </Button>
            <button
              className="pd-onb__textlink"
              onClick={restartForAnotherPet}
              type="button"
            >
              Add another pet
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
