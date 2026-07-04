import { useEffect, useRef, useState } from "react";
import { Button } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import wordmarkUrl from "@pets-driven/design-system/assets/petsdriven-wordmark.svg";
import {
  desktopGateway,
  type CodexPetPackage,
  type DesktopGateway,
} from "@/app/desktop-gateway";
import {
  PERSONALITY_OPTIONS,
  personalityBlurbKey,
  personalityTitleKey,
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
  personalityId: PetPersonalityId;
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

/** Pick a random personality preset so each new pet starts with a fresh one. */
function randomPersonalityId(): PetPersonalityId {
  if (PERSONALITY_OPTIONS.length === 0) {
    return "playful";
  }
  const index = Math.floor(Math.random() * PERSONALITY_OPTIONS.length);
  return PERSONALITY_OPTIONS[index].id;
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
  const { t } = useTranslation("desktop");
  return (
    <header className="pd-onb__top">
      <button
        aria-label={t("onboarding.goHome")}
        className="pd-onb__wordmark-btn"
        onClick={onExit}
        type="button"
      >
        <img
          alt={t("onboarding.wordmarkAlt")}
          className="pd-onb__wordmark"
          src={wordmarkUrl}
        />
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
          {t("onboarding.step", { step, total })}
        </span>
      </div>
      <button
        aria-label={t("onboarding.exit")}
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
  const { t } = useTranslation("desktop");
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
    useState<PetPersonalityId>(randomPersonalityId);
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
    if (!assetId || !isValidPetName(name)) {
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

    // The watch folder is optional: a pet can be adopted without one and given
    // a folder later from its settings. Only register when one was chosen.
    let nextState: PetsDrivenState = adopted;
    if (selectedFolderPath) {
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
          t("onboarding.occupiedError", {
            name: owner?.name ?? t("onboarding.anotherPet"),
          }),
        );
        return;
      }

      nextState = result.state;
    }

    setAdoptionError(null);

    // The pet is born at home, not thrown straight onto the desktop — the user
    // deploys it from the main window when they're ready.
    const homeState: PetsDrivenState = {
      ...nextState,
      pets: nextState.pets.map((pet) =>
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
        personalityId: personality.id,
        folderPath: selectedFolderPath
          ? normalizeWorkingDirectoryPath(selectedFolderPath)
          : "",
      });
      setStep("done");
    } catch (error) {
      setAdoptionError(error instanceof Error ? error.message : String(error));
    }
  }

  function restartForAnotherPet() {
    setAssetId(null);
    setName("");
    setPersonalityId(randomPersonalityId());
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
    <main aria-label={t("onboarding.pageAria")} className="pd-onb">
      <div aria-hidden className="pd-onb__dots" />
      <StepHeader onExit={onDone} step={stepNumber} total={totalSteps} />

      {step === "welcome" && (
        <section className="pd-onb__body pd-onb__welcome">
          <span className="pd-onb__eyebrow">
            {t("onboarding.welcomeEyebrow")}
          </span>
          <h1 className="pd-onb__title pd-onb__title--hero">
            {t("onboarding.welcomeTitle")}
          </h1>
          <p className="pd-onb__lede">{t("onboarding.welcomeLede")}</p>
          <div className="pd-onb__footer">
            <span className="pd-onb__fineprint">
              {t("onboarding.welcomeFineprint")}
            </span>
            <Button onClick={() => setStep("choose")} size="lg">
              {t("onboarding.getStarted")}
            </Button>
          </div>
        </section>
      )}

      {step === "choose" && (
        <section className="pd-onb__body">
          <span className="pd-onb__eyebrow">
            {t("onboarding.chooseEyebrow")}
          </span>
          {packages.length > 0 ? (
            <>
              <h1 className="pd-onb__title">{t("onboarding.chooseTitle")}</h1>
              <p className="pd-onb__lede">{t("onboarding.chooseLede")}</p>
              <PetPackageGrid
                onSelect={setAssetId}
                packages={packages}
                selectedAssetId={assetId}
              />
              <div className="pd-onb__petdex-cta">
                <span>{t("onboarding.petdexCta")}</span>
                <a href={PETDEX_URL} rel="noreferrer" target="_blank">
                  {t("onboarding.openPetdex")}
                </a>
              </div>
            </>
          ) : (
            <div className="pd-onb__empty">
              <h1 className="pd-onb__title">{t("onboarding.emptyTitle")}</h1>
              <p className="pd-onb__lede">{t("onboarding.emptyLede")}</p>
              <div className="pd-onb__petdex-empty">
                <code>npx petdex install boba</code>
                <a href={PETDEX_URL} rel="noreferrer" target="_blank">
                  {t("onboarding.browsePetdex")}
                </a>
              </div>
              <span className="pd-onb__paw" aria-hidden>
                🐾
              </span>
            </div>
          )}
          <div className="pd-onb__footer">
            {/* "choose" is the first step when there's no welcome (a pet already
                exists), so Back exits to home instead of the first-time welcome. */}
            <Button
              onClick={includeWelcome ? () => setStep("welcome") : onDone}
              variant="ghost"
            >
              {t("onboarding.back")}
            </Button>
            <Button disabled={!assetId} onClick={goToProfile} size="lg">
              {t("onboarding.continue")}
            </Button>
          </div>
        </section>
      )}

      {step === "profile" && (
        <section className="pd-onb__body pd-onb__profile">
          <div className="pd-onb__profile-form">
            <span className="pd-onb__eyebrow">
              {t("onboarding.profileEyebrow")}
            </span>
            <h1 className="pd-onb__title">{t("onboarding.profileTitle")}</h1>

            <label className="pd-onb__label" htmlFor="pd-onb-name">
              {t("onboarding.petName")}
            </label>
            <div className="pd-onb__name">
              <input
                className="pd-onb__name-input"
                id="pd-onb-name"
                maxLength={PET_NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("onboarding.petNamePlaceholder")}
                value={name}
              />
              <span className="pd-onb__name-count">
                {name.trim().length} / {PET_NAME_MAX_LENGTH}
              </span>
            </div>

            <div className="pd-onb__label">{t("onboarding.personality")}</div>
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
                  {t(personalityTitleKey(option.id))}
                </button>
              ))}
            </div>
            <p className="pd-onb__hint">
              {t(personalityBlurbKey(personality.id))}
            </p>
          </div>

          <aside className="pd-onb__preview">
            {selectedPackage && (
              <PetPreview assetId={selectedPackage.id} scale={1.3} />
            )}
            <div className="pd-onb__preview-name">
              {name.trim() || t("common.yourPet")}
            </div>
            <div className="pd-onb__preview-meta">
              {t(personalityTitleKey(personality.id))}
              {selectedPackage ? ` · ${selectedPackage.displayName}` : ""}
            </div>
          </aside>

          <div className="pd-onb__footer">
            <Button onClick={() => setStep("choose")} variant="ghost">
              {t("onboarding.back")}
            </Button>
            <Button
              disabled={!isValidPetName(name)}
              onClick={() => setStep("folder")}
              size="lg"
            >
              {t("onboarding.looksGood")}
            </Button>
          </div>
        </section>
      )}

      {step === "folder" && (
        <section className="pd-onb__body">
          <span className="pd-onb__eyebrow">
            {t("onboarding.folderEyebrow")}
          </span>
          <h1 className="pd-onb__title">
            {t("onboarding.folderTitle", {
              name: name.trim() || t("common.yourPet"),
            })}
          </h1>
          <p className="pd-onb__lede">{t("onboarding.folderLede")}</p>
          <p className="pd-onb__fineprint">
            {t("onboarding.folderOptionalHint")}
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
                      {t("onboarding.folderWatchedBy", { name: owner?.name })}
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
                <b>{t("onboarding.chooseAnother")}</b>
                <small>{t("onboarding.chooseAnotherHint")}</small>
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
              {t("onboarding.back")}
            </Button>
            <Button onClick={() => void completeBirth()} size="lg">
              {selectedFolderPath
                ? t("onboarding.adopt")
                : t("onboarding.adoptNoFolder")}
            </Button>
          </div>
        </section>
      )}

      {step === "done" && bornPet && (
        <section className="pd-onb__body pd-onb__done">
          <div className="pd-onb__done-pet">
            <PetPreview assetId={bornPet.assetId} scale={1.1} />
          </div>
          <span className="pd-onb__eyebrow">
            {t("onboarding.doneIsHome", { name: bornPet.name })}
          </span>
          <h1 className="pd-onb__title pd-onb__title--hero">
            {t("onboarding.doneTitle")}
          </h1>

          <div className="pd-onb__summary">
            <div className="pd-onb__summary-row">
              <span>{t("onboarding.summaryPet")}</span>
              <strong>
                {bornPet.name} · {t(personalityTitleKey(bornPet.personalityId))}
              </strong>
            </div>
            <div className="pd-onb__summary-row">
              <span>{t("onboarding.summaryWatches")}</span>
              <strong>
                {bornPet.folderPath || t("onboarding.summaryWatchesNone")}
              </strong>
            </div>
            <div className="pd-onb__summary-row">
              <span>{t("onboarding.summaryReactsTo")}</span>
              <strong>{t("onboarding.summaryReactsToValue")}</strong>
            </div>
          </div>

          <div className="pd-onb__done-actions">
            <Button onClick={onDone} size="lg">
              {t("onboarding.openApp")}
            </Button>
            <button
              className="pd-onb__textlink"
              onClick={restartForAnotherPet}
              type="button"
            >
              {t("onboarding.addAnother")}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
