import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  FolderIcon,
  IconButton,
  Input,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
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
import { useClaudePlugin } from "@/app/use-claude-plugin";
import { adoptPet, registerWorkingDirectory } from "@/app-state/pet-adoption";
import {
  addPetSourceDirectory,
  normalizeWorkingDirectoryPath,
  removePetSourceDirectory,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

const PET_NAME_MAX_LENGTH = 24;
const TOTAL_STEPS = 6;
const PETDEX_URL = "https://petdex.dev";

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
  initialStep?: "welcome" | "choose";
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

// Inlined so the wordmark text follows the theme (a static <img> can't be
// recolored, leaving the near-black lettering invisible in dark mode). The
// brand mark keeps its fixed colors; only the text tracks --text-strong.
function Wordmark({ title }: { title: string }) {
  return (
    <svg
      aria-label={title}
      className="pd-onb__wordmark"
      role="img"
      viewBox="0 0 360 100"
    >
      <rect x="6" y="14" width="72" height="72" rx="22" fill="#F95E9E" />
      <ellipse cx="42" cy="60" rx="14" ry="11.5" fill="#fff" />
      <ellipse cx="26" cy="49" rx="5.6" ry="7.2" fill="#fff" />
      <ellipse cx="36" cy="41" rx="5.6" ry="7.6" fill="#fff" />
      <ellipse cx="48" cy="41" rx="5.6" ry="7.6" fill="#fff" />
      <ellipse cx="58" cy="49" rx="5.6" ry="7.2" fill="#fff" />
      <path
        d="M42 63 C40 59.5 35 60.5 35 64 C35 67 42 70 42 70 C42 70 49 67 49 64 C49 60.5 44 59.5 42 63 Z"
        fill="#16B8A6"
      />
      <text
        x="96"
        y="65"
        fontFamily="Fredoka, Trebuchet MS, sans-serif"
        fontSize="42"
        fontWeight="600"
        fill="var(--text-strong)"
      >
        Pets<tspan fill="#F95E9E">-</tspan>Driven
      </text>
    </svg>
  );
}

/**
 * Install card for the Claude Code plugin, shown once the pet is born — the
 * plugin forwards the agent events the new pet reacts to. Installing is a
 * one-click consent, never automatic, since it touches the user's Claude
 * Code configuration.
 */
function ClaudeConnectCard({ gateway }: { gateway: DesktopGateway }) {
  const { t } = useTranslation("desktop");
  const { status, busy, install } = useClaudePlugin(gateway);

  const hintText = !status
    ? t("claudePlugin.checking")
    : status.state === "installed"
      ? t("claudePlugin.installedHint")
      : status.state === "cli-missing"
        ? t("claudePlugin.cliMissing")
        : status.state === "error"
          ? (status.error ?? t("claudePlugin.error"))
          : t("claudePlugin.notInstalledHint");

  return (
    <div className="pd-onb__connect-card">
      <span className="pd-onb__connect-text">
        <b>{t("claudePlugin.connectTitle")}</b>
        <small>{hintText}</small>
      </span>
      {status?.state === "installed" ? (
        <span className="pd-onb__connect-ok">
          ✓ {t("claudePlugin.installed")}
        </span>
      ) : status && status.state !== "cli-missing" ? (
        <Button disabled={busy} onClick={() => void install()}>
          {busy
            ? t("claudePlugin.installing")
            : status.state === "error"
              ? t("claudePlugin.retry")
              : t("claudePlugin.install")}
        </Button>
      ) : null}
    </div>
  );
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
        <Wordmark title={t("onboarding.wordmarkAlt")} />
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
  initialStep,
}: OnboardingFlowProps) {
  const { t } = useTranslation("desktop");
  // Welcome is an intro shown only to first-time users; once any pet exists the
  // flow starts at "choose". Frozen per run so the step count stays stable even
  // after this run adopts a pet.
  const [includeWelcome] = useState(() => state.pets.length === 0);
  const [step, setStep] = useState<OnboardingStep>(() =>
    initialStep ?? (state.pets.length === 0 ? "welcome" : "choose"),
  );
  const [packages, setPackages] = useState<CodexPetPackage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
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
        setAdoptionError(
          error instanceof Error ? error.message : String(error),
        );
        return;
      }

      void loadPackages();
    },
    [gateway, loadPackages, onStateChange],
  );

  const addSourceFolder = useCallback(async () => {
    const picked = await gateway.pickDirectory();

    if (!picked) {
      return;
    }

    const nextState = addPetSourceDirectory(stateRef.current, picked);

    // Already registered: nothing to persist, but rescan in case the folder
    // gained pets since it was added.
    if (nextState === stateRef.current) {
      void loadPackages();
      return;
    }

    await persistAndRescan(nextState);
  }, [gateway, loadPackages, persistAndRescan]);

  const removeSourceFolder = useCallback(
    async (path: string) => {
      const nextState = removePetSourceDirectory(stateRef.current, path);

      if (nextState === stateRef.current) {
        return;
      }

      await persistAndRescan(nextState);
    },
    [persistAndRescan],
  );

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

  function renderSourceFolders() {
    if (state.petSourceDirectories.length === 0) {
      return null;
    }

    return (
      <div className="pd-onb__sources">
        <span className="pd-onb__sources-label">
          {t("onboarding.sourceFoldersLabel")}
        </span>
        {state.petSourceDirectories.map((path) => (
          <div className="pd-onb__source" key={path}>
            <span className="pd-onb__source-icon" aria-hidden>
              📁
            </span>
            <span className="pd-onb__source-text">
              <b>{folderName(path)}</b>
              <small>{path}</small>
            </span>
            <button
              aria-label={t("onboarding.removeFolder", {
                name: folderName(path),
              })}
              className="pd-onb__source-remove"
              onClick={() => void removeSourceFolder(path)}
              type="button"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
    );
  }

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
              <div className="pd-onb__list-head">
                <div className="pd-onb__list-head-text">
                  <h1 className="pd-onb__title">
                    {t("onboarding.chooseTitle")}
                  </h1>
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
                    disabled={refreshing}
                    label={t("onboarding.refresh")}
                    onClick={() => void loadPackages()}
                    variant="ghost"
                  >
                    <RefreshIcon
                      className={refreshing ? "pd-onb__spin" : undefined}
                    />
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
                  onClick={() => void addSourceFolder()}
                  type="button"
                >
                  <FolderIcon />
                  {t("onboarding.addFolder")}
                </button>
              </div>
              {renderSourceFolders()}
            </>
          ) : (
            <div className="pd-onb__empty">
              <div className="pd-onb__empty-copy">
                <h1 className="pd-onb__title">{t("onboarding.emptyTitle")}</h1>
                <p className="pd-onb__lede">{t("onboarding.emptyLede")}</p>

                <div className="pd-onb__petdex-empty">
                  <span className="pd-onb__petdex-empty-label">
                    {t("onboarding.petdexCta")}
                  </span>
                  <div className="pd-onb__petdex-empty-row">
                    <code>npx petdex install boba</code>
                    <a href={PETDEX_URL} rel="noreferrer" target="_blank">
                      {t("onboarding.browsePetdex")}
                    </a>
                  </div>
                </div>

                {renderSourceFolders()}
              </div>

              {/* "No pets yet" motif — a muted slot with drifting paw prints. */}
              <div className="pd-onb__empty-art" aria-hidden>
                <span className="pd-onb__empty-art-paw pd-onb__empty-art-paw--lg">
                  🐾
                </span>
                <span className="pd-onb__empty-art-paw pd-onb__empty-art-paw--sm">
                  🐾
                </span>
                <span className="pd-onb__empty-art-paw pd-onb__empty-art-paw--xs">
                  🐾
                </span>
              </div>
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
            {packages.length > 0 ? (
              <Button disabled={!assetId} onClick={goToProfile} size="lg">
                {t("onboarding.continue")}
              </Button>
            ) : (
              <div className="pd-onb__actions">
                <Button
                  disabled={refreshing}
                  iconLeft={
                    <RefreshIcon
                      className={refreshing ? "pd-onb__spin" : undefined}
                    />
                  }
                  onClick={() => void loadPackages()}
                  variant="ghost"
                >
                  {t("onboarding.refresh")}
                </Button>
                <Button
                  iconLeft={<FolderIcon />}
                  onClick={() => void addSourceFolder()}
                  size="lg"
                >
                  {t("onboarding.emptyChooseFolder")}
                </Button>
              </div>
            )}
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

          <ClaudeConnectCard gateway={gateway} />

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
