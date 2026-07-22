import {
  Button,
  FolderIcon,
  IconButton,
  Input,
  RefreshIcon,
  SearchIcon,
  TerminalIcon,
} from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { type CodexPetPackage, type DesktopGateway, desktopGateway } from "@/app/desktop-gateway";
import {
  PERSONALITY_OPTIONS,
  type PersonalityOption,
  personalityBlurbKey,
  personalityTitleKey,
} from "@/app/onboarding/personality-options";
import { PetPackageGrid } from "@/app/onboarding/pet-package-grid";
import { PetdexTerminalDialog } from "@/app/onboarding/petdex-terminal-dialog";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";
import { Wordmark } from "@/app/onboarding/wordmark";
import { adoptPet, registerWorkingDirectory } from "@/app-state/pet-adoption";
import {
  normalizeWorkingDirectoryPath,
  type PetsDrivenState,
  setPetSourceDirectory,
} from "@/app-state/pets-driven-state";

const PET_NAME_MAX_LENGTH = 24;
const PETDEX_URL = "https://petdex.dev";

type AdoptPetStep = "choose" | "profile" | "folder" | "done";
const STEP_ORDER: AdoptPetStep[] = ["choose", "profile", "folder", "done"];

type BornPet = {
  id: string;
  name: string;
  assetId: string;
  personalityId: PetPersonalityId;
  folderPath: string;
};

type AdoptPetFlowProps = {
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
      animationState="idle"
      elapsedMs={elapsedMs}
      imageUrl={spritesheetUrl}
      scale={scale}
      showStatusBubble={false}
      size={PET_CELL_SIZE}
    />
  ) : null;
}

function StepHeader({ step, total, onExit }: { step: number; total: number; onExit: () => void }) {
  const { t } = useTranslation("desktop");
  return (
    <header className="pd-onb__top">
      <button
        aria-label={t("onboarding.goHome")}
        className="pd-onb__wordmark-btn"
        onClick={onExit}
        type="button"
      >
        <Wordmark title={t("onboarding.wordmarkAlt")} />
      </button>
      <div className="pd-onb__steps">
        <div aria-hidden className="pd-onb__dots-row">
          {Array.from({ length: total }, (_, index) => (
            <span
              className={`pd-onb__step-dot${index < step ? " pd-onb__step-dot--on" : ""}`}
              // biome-ignore lint/suspicious/noArrayIndexKey: Using index as key is safe here because the number of steps is fixed and never changes.
              key={index}
            />
          ))}
        </div>
        <span className="pd-onb__step-label">{t("onboarding.step", { step, total })}</span>
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

/**
 * Adopts a single pet: pick a look, name it and give it a personality, then
 * optionally point it at a folder to watch. Entered either from the setup
 * wizard's "Create your first pet" CTA or from "Add a pet" anywhere else in
 * the app — it always starts at "choose".
 */
export function AdoptPetFlow({
  state,
  onStateChange,
  onDone,
  gateway = desktopGateway,
}: AdoptPetFlowProps) {
  const { t } = useTranslation("desktop");
  const [step, setStep] = useState<AdoptPetStep>("choose");
  const [packages, setPackages] = useState<CodexPetPackage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [personalityId, setPersonalityId] = useState<PetPersonalityId>(randomPersonalityId);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [bornPet, setBornPet] = useState<BornPet | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const loadPackages = useCallback(async () => {
    setRefreshing(true);
    try {
      setPackages(await gateway.listPetPackages());
    } catch {
      setPackages([]);
    } finally {
      setRefreshing(false);
    }
  }, [gateway]);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  // Persist a mutated state and rescan the pet-pack roots so a folder change is
  // reflected in the list immediately. Reuses the same write path as adoption.
  const persistAndRescan = useCallback(
    async (nextState: PetsDrivenState) => {
      try {
        await gateway.writePetsDrivenState(nextState);
        onStateChange(nextState);
        setAdoptionError(null);
      } catch (error) {
        setAdoptionError(error instanceof Error ? error.message : String(error));
        return;
      }

      void loadPackages();
    },
    [gateway, loadPackages, onStateChange],
  );

  const changeSourceFolder = useCallback(async () => {
    const picked = await gateway.pickDirectory();

    if (!picked) {
      return;
    }

    const nextState = setPetSourceDirectory(stateRef.current, picked);

    // Same folder picked again: nothing to persist, but rescan in case it
    // gained pets since the last scan.
    if (nextState === stateRef.current) {
      void loadPackages();
      return;
    }

    await persistAndRescan(nextState);
  }, [gateway, loadPackages, persistAndRescan]);

  const normalizedQuery = query.trim().toLowerCase();
  const visiblePackages = normalizedQuery
    ? packages.filter(
        (pet) =>
          pet.displayName.toLowerCase().includes(normalizedQuery) ||
          pet.description.toLowerCase().includes(normalizedQuery),
      )
    : packages;

  const selectedPackage = packages.find((pet) => pet.id === assetId) ?? null;
  const personality =
    PERSONALITY_OPTIONS.find((option) => option.id === personalityId) ?? PERSONALITY_OPTIONS[0];

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
        const owner = stateRef.current.pets.find((pet) => pet.id === result.ownerPetId);
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
      pets: nextState.pets.map((pet) => (pet.id === petId ? { ...pet, visible: false } : pet)),
    };

    try {
      await gateway.writePetsDrivenState(homeState);
      onStateChange(homeState);
      setBornPet({
        id: petId,
        name: trimmedName,
        assetId,
        personalityId: personality.id,
        folderPath: selectedFolderPath ? normalizeWorkingDirectoryPath(selectedFolderPath) : "",
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
    setStep("choose");
  }

  const totalSteps = STEP_ORDER.length;
  const stepNumber = STEP_ORDER.indexOf(step) + 1;

  function renderSourceFolder() {
    if (!state.petSourceDirectory) {
      return null;
    }

    return (
      <div className="pd-onb__sources">
        <span className="pd-onb__sources-label">{t("onboarding.sourceFoldersLabel")}</span>
        <div className="pd-onb__source">
          <span className="pd-onb__source-icon" aria-hidden>
            📁
          </span>
          <span className="pd-onb__source-text">
            <b>{folderName(state.petSourceDirectory)}</b>
            <small>{state.petSourceDirectory}</small>
          </span>
        </div>
      </div>
    );
  }

  return (
    <main aria-label={t("onboarding.pageAria")} className="pd-onb">
      <div aria-hidden className="pd-onb__dots" />
      <StepHeader onExit={onDone} step={stepNumber} total={totalSteps} />

      {step === "choose" && (
        <section className="pd-onb__body">
          <span className="pd-onb__eyebrow">{t("onboarding.chooseEyebrow")}</span>
          {packages.length > 0 ? (
            <>
              <div className="pd-onb__list-head">
                <div className="pd-onb__list-head-text">
                  <h1 className="pd-onb__title">{t("onboarding.chooseTitle")}</h1>
                  <p className="pd-onb__lede">{t("onboarding.chooseLede")}</p>
                </div>
                <div className="pd-onb__list-tools">
                  {searchOpen && (
                    <Input
                      aria-label={t("onboarding.search")}
                      autoFocus
                      className="pd-onb__search"
                      icon={<SearchIcon />}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t("onboarding.searchPlaceholder")}
                      size="sm"
                      value={query}
                    />
                  )}
                  <IconButton
                    label={t("onboarding.search")}
                    onClick={() => {
                      setSearchOpen((open) => {
                        if (open) {
                          setQuery("");
                        }
                        return !open;
                      });
                    }}
                    variant={searchOpen ? "soft" : "ghost"}
                  >
                    <SearchIcon />
                  </IconButton>
                  <IconButton
                    label={t("onboarding.openTerminal")}
                    onClick={() => setTerminalOpen(true)}
                    variant="ghost"
                  >
                    <TerminalIcon />
                  </IconButton>
                  <IconButton
                    disabled={refreshing}
                    label={t("onboarding.refresh")}
                    onClick={() => void loadPackages()}
                    variant="ghost"
                  >
                    <RefreshIcon className={refreshing ? "pd-onb__spin" : undefined} />
                  </IconButton>
                </div>
              </div>
              {visiblePackages.length > 0 ? (
                <PetPackageGrid
                  onSelect={setAssetId}
                  packages={visiblePackages}
                  selectedAssetId={assetId}
                />
              ) : (
                <p className="pd-onb__lede">{t("onboarding.noMatches")}</p>
              )}
              <div className="pd-onb__petdex-cta">
                <span>{t("onboarding.petdexCta")}</span>
                <a href={PETDEX_URL} rel="noreferrer" target="_blank">
                  {t("onboarding.openPetdex")}
                </a>
                <button
                  className="pd-onb__addfolder"
                  onClick={() => void changeSourceFolder()}
                  type="button"
                >
                  <FolderIcon />
                  {t("onboarding.changeFolder")}
                </button>
              </div>
              {renderSourceFolder()}
            </>
          ) : (
            <div className="pd-onb__empty">
              <div className="pd-onb__empty-copy">
                <h1 className="pd-onb__title">{t("onboarding.emptyTitle")}</h1>
                <p className="pd-onb__lede">{t("onboarding.emptyLede")}</p>
              </div>

              {/* No installed looks: spell out the ways to get the first one. */}
              <span className="pd-onb__empty-steps-label">{t("onboarding.emptyStepsLabel")}</span>
              <div className="pd-onb__empty-actions">
                <div className="pd-onb__empty-card pd-onb__empty-card--primary">
                  <span className="pd-onb__empty-card-icon" aria-hidden>
                    🐾
                  </span>
                  <b className="pd-onb__empty-card-title">{t("onboarding.emptyInstallTitle")}</b>
                  <p className="pd-onb__empty-card-desc">{t("onboarding.emptyInstallDesc")}</p>
                  <code className="pd-onb__empty-card-code">npx petdex install boba</code>
                  <a
                    className="pd-onb__empty-card-link"
                    href={PETDEX_URL}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("onboarding.browsePetdex")}
                    <span aria-hidden> ↗</span>
                  </a>
                </div>

                <button
                  className="pd-onb__empty-card pd-onb__empty-card--action"
                  onClick={() => void changeSourceFolder()}
                  type="button"
                >
                  <span className="pd-onb__empty-card-icon" aria-hidden>
                    <FolderIcon />
                  </span>
                  <b className="pd-onb__empty-card-title">{t("onboarding.emptyChooseFolder")}</b>
                  <p className="pd-onb__empty-card-desc">{t("onboarding.emptyChooseFolderHint")}</p>
                  <span className="pd-onb__empty-card-cue" aria-hidden>
                    →
                  </span>
                </button>

                <button
                  className="pd-onb__empty-card pd-onb__empty-card--action"
                  disabled={refreshing}
                  onClick={() => void loadPackages()}
                  type="button"
                >
                  <span className="pd-onb__empty-card-icon" aria-hidden>
                    <RefreshIcon className={refreshing ? "pd-onb__spin" : undefined} />
                  </span>
                  <b className="pd-onb__empty-card-title">{t("onboarding.emptyRefreshTitle")}</b>
                  <p className="pd-onb__empty-card-desc">{t("onboarding.emptyRefreshDesc")}</p>
                  <span className="pd-onb__empty-card-cue" aria-hidden>
                    →
                  </span>
                </button>
              </div>

              {renderSourceFolder()}
            </div>
          )}
          <div className="pd-onb__footer">
            <Button onClick={onDone} variant="ghost">
              {t("onboarding.back")}
            </Button>
            {packages.length > 0 ? (
              <Button disabled={!assetId} onClick={goToProfile} size="lg">
                {t("onboarding.continue")}
              </Button>
            ) : null}
          </div>
        </section>
      )}

      {step === "profile" && (
        <section className="pd-onb__body pd-onb__profile">
          <div className="pd-onb__profile-form">
            <span className="pd-onb__eyebrow">{t("onboarding.profileEyebrow")}</span>
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
              {PERSONALITY_OPTIONS.map((option: PersonalityOption) => {
                const isSelected = personalityId === option.id;

                return (
                  <label
                    className={`pd-onb__pill${isSelected ? " pd-onb__pill--on" : ""}`}
                    key={option.id}
                  >
                    <input
                      checked={isSelected}
                      className="pd-onb__pill-input"
                      name="personality"
                      onChange={() => setPersonalityId(option.id)}
                      type="radio"
                      value={option.id}
                    />
                    <span className="pd-onb__pill-label">{t(personalityTitleKey(option.id))}</span>
                  </label>
                );
              })}
            </div>
            <p className="pd-onb__hint">{t(personalityBlurbKey(personality.id))}</p>
          </div>

          <aside className="pd-onb__preview">
            {selectedPackage && <PetPreview assetId={selectedPackage.id} scale={1.3} />}
            <div className="pd-onb__preview-name">{name.trim() || t("common.yourPet")}</div>
            <div className="pd-onb__preview-meta">
              {t(personalityTitleKey(personality.id))}
              {selectedPackage ? ` · ${selectedPackage.displayName}` : ""}
            </div>
          </aside>

          <div className="pd-onb__footer">
            <Button onClick={() => setStep("choose")} variant="ghost">
              {t("onboarding.back")}
            </Button>
            <Button disabled={!isValidPetName(name)} onClick={() => setStep("folder")} size="lg">
              {t("onboarding.looksGood")}
            </Button>
          </div>
        </section>
      )}

      {step === "folder" && (
        <section className="pd-onb__body">
          <span className="pd-onb__eyebrow">{t("onboarding.folderEyebrow")}</span>
          <h1 className="pd-onb__title">
            {t("onboarding.folderTitle", {
              name: name.trim() || t("common.yourPet"),
            })}
          </h1>
          <p className="pd-onb__lede">{t("onboarding.folderLede")}</p>
          <p className="pd-onb__fineprint">{t("onboarding.folderOptionalHint")}</p>

          <div className="pd-onb__folders">
            {state.registeredWorkingDirectories.map((directory) => {
              const owner = state.pets.find((pet) => pet.id === directory.petId);
              const occupied = Boolean(owner) && owner?.id !== bornPet?.id;
              const selected =
                selectedFolderPath != null &&
                comparablePath(selectedFolderPath) === comparablePath(directory.path);

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
                  comparablePath(directory.path) === comparablePath(selectedFolderPath),
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
              {selectedFolderPath ? t("onboarding.adopt") : t("onboarding.adoptNoFolder")}
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
          <h1 className="pd-onb__title pd-onb__title--hero">{t("onboarding.doneTitle")}</h1>

          <div className="pd-onb__summary">
            <div className="pd-onb__summary-row">
              <span>{t("onboarding.summaryPet")}</span>
              <strong>
                {bornPet.name} · {t(personalityTitleKey(bornPet.personalityId))}
              </strong>
            </div>
            <div className="pd-onb__summary-row">
              <span>{t("onboarding.summaryWatches")}</span>
              <strong>{bornPet.folderPath || t("onboarding.summaryWatchesNone")}</strong>
            </div>
          </div>

          <div className="pd-onb__done-actions">
            <Button onClick={onDone} size="lg">
              {t("onboarding.openApp")}
            </Button>
            <button className="pd-onb__textlink" onClick={restartForAnotherPet} type="button">
              {t("onboarding.addAnother")}
            </button>
          </div>
        </section>
      )}

      <PetdexTerminalDialog
        available={isTauri()}
        cwd={state.petSourceDirectory ?? null}
        onClose={() => {
          setTerminalOpen(false);
          // A petdex install run in the terminal drops new packs into the scan
          // root; rescan on close so they show up without a manual refresh.
          void loadPackages();
        }}
        open={terminalOpen}
      />
    </main>
  );
}
