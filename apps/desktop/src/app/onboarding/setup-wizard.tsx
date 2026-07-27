import type { PetName } from "@pets-driven/design-system";
import { Button, ExternalLinkIcon, PetAvatar, TerminalIcon } from "@pets-driven/design-system";
import { localeLabels, locales, useTranslation } from "@pets-driven/i18n";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  type CodexPetPackage,
  type DesktopGateway,
  desktopGateway,
  type PetSourceDirectoryOption,
} from "@/app/desktop-gateway";
import { useDesktopLocale } from "@/app/i18n/desktop-locale";
import { PluginRunTerminal } from "@/app/main-window/plugin-run-terminal";
import { TerminalSection } from "@/app/main-window/terminal-section";
import { useTerminalShellOptions } from "@/app/main-window/use-terminal-shell-options";
import { PetdexTerminalDialog } from "@/app/onboarding/petdex-terminal-dialog";
import {
  body,
  bodyTop,
  content,
  doneActions,
  doneChip,
  doneChips,
  doneWrap,
  emptyStrip,
  eyebrow,
  fieldHint,
  folderCountRow,
  folderIcon,
  folderSelectButton,
  folderSelectName,
  footer,
  footerActions,
  guideCard,
  guideName,
  guideQuote,
  heroWrap,
  inlineTermShell,
  lede,
  petGetActions,
  petGetButton,
  petGetButtonPrimary,
  pluginBadge,
  pluginCard,
  pluginGrid,
  pluginSubtitle,
  rail,
  railLogo,
  sectionLabel,
  seg,
  segWrap,
  skipAll,
  stepBadge,
  stepDesc,
  stepRow,
  stepTitle,
  swatch,
  textLink,
  title,
  topBar,
  wizardSelect,
} from "@/app/onboarding/setup-wizard.styles";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";
import { Wordmark } from "@/app/onboarding/wordmark";
import { PetLookStrip } from "@/app/pet-assets/pet-look-strip";
import { buildLaunchLine, parseLaunchLine } from "@/app/session-launch-line";
import { ACCENTS, useDesktopTheme } from "@/app/theme/desktop-theme";
import { useAgentPlugin } from "@/app/use-agent-plugin";
import { type PetsDrivenState, setPetSourceDirectory } from "@/app-state/pets-driven-state";

const PETDEX_URL = "https://petdex.dev";

/** Sentinel value for the pet-folder dropdown's "browse for a folder" entry. No
 * real path equals it, so it never collides with a designated folder. */
const BROWSE_FOLDER_VALUE = "__browse__";

type WizardStep = "welcome" | "appearance" | "petsFolder" | "plugin" | "done";

const CHECKLIST_STEPS: WizardStep[] = ["welcome", "appearance", "petsFolder", "plugin"];

const GUIDE: Record<WizardStep, { pet: PetName; quoteKey: string }> = {
  welcome: { pet: "cato", quoteKey: "setupWizard.guideWelcome" },
  appearance: { pet: "mochi", quoteKey: "setupWizard.guideAppearance" },
  petsFolder: { pet: "otto", quoteKey: "setupWizard.guidePetsFolder" },
  plugin: { pet: "fenn", quoteKey: "setupWizard.guidePlugin" },
  done: { pet: "cato", quoteKey: "setupWizard.guideDone" },
};

type SetupWizardProps = {
  state: PetsDrivenState;
  onStateChange: (state: PetsDrivenState) => void;
  /** Skip / "Go to home" — leaves the wizard without creating a pet. */
  onDone: () => void;
  /** "Create your first pet →" on the final screen. */
  onCreatePet: () => void;
  gateway?: DesktopGateway;
};

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

/** The finish-line hero on the "done" step — waves instead of standing still. */
function DoneHeroPet({ assetId }: { assetId: string }) {
  const spritesheetUrl = usePetSpritesheetUrl(assetId);
  const elapsedMs = useAnimationClock();

  return spritesheetUrl ? (
    <PetSprite
      alt="Your pet"
      animationState="waving"
      elapsedMs={elapsedMs}
      imageUrl={spritesheetUrl}
      scale={1.6}
      showStatusBubble={false}
      size={PET_CELL_SIZE}
    />
  ) : null;
}

export function SetupWizard({
  state,
  onStateChange,
  onDone,
  onCreatePet,
  gateway = desktopGateway,
}: SetupWizardProps) {
  const { t } = useTranslation("desktop");
  const { mode, setMode, accent, setAccent } = useDesktopTheme();
  const { locale, setLocale } = useDesktopLocale();
  const claudePlugin = useAgentPlugin(gateway, "claude");
  const codexPlugin = useAgentPlugin(gateway, "codex");
  const [step, setStep] = useState<WizardStep>("welcome");
  const [looksFound, setLooksFound] = useState<number | null>(null);
  const [petPackages, setPetPackages] = useState<CodexPetPackage[]>([]);
  const [folderOptions, setFolderOptions] = useState<PetSourceDirectoryOption[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [copyingPets, setCopyingPets] = useState(false);
  const shellOptions = useTerminalShellOptions(gateway);
  const currentShell = state.terminalShell ?? "";
  // Keep a persisted shell the system probe didn't surface pickable in the list.
  const hasCustomShell =
    currentShell.trim() !== "" && !shellOptions.some((option) => option.path === currentShell);

  useEffect(() => {
    let isActive = true;
    void gateway.listPetSourceDirectoryOptions().then((options) => {
      if (isActive) {
        setFolderOptions(options);
      }
    });

    return () => {
      isActive = false;
    };
  }, [gateway]);

  // Scan the designated folder for the "N looks found" count — the folder's own
  // pets only, not the bundled defaults, so an empty folder honestly reads as 0
  // and the "copy default pets" button visibly fills it. On the pets-folder step
  // the scan repeats every few seconds, so installing a pet from Petdex and
  // switching back to the app updates the number without a manual refresh.
  // Background re-scans keep the last count on screen (no loading flicker);
  // only the very first scan shows the pulsing "looking…" state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: state.petSourceDirectory is an intentional re-scan trigger — it is not read in the body, but changing the pet folder must refresh the count immediately rather than waiting for the interval.
  useEffect(() => {
    let isActive = true;

    async function scan() {
      try {
        const packages = await gateway.listDesignatedPetPackages();
        if (isActive) {
          setLooksFound(packages.length);
          setPetPackages(packages);
        }
      } catch {
        if (isActive) {
          setLooksFound(null);
        }
      }
    }

    void scan();

    if (step !== "petsFolder") {
      return () => {
        isActive = false;
      };
    }

    const interval = window.setInterval(() => void scan(), 3000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [gateway, state.petSourceDirectory, step]);

  async function applyPetSourceDirectory(path: string | null) {
    const nextState = setPetSourceDirectory(state, path);

    if (nextState === state) {
      return;
    }

    await gateway.updateSettings({ petSourceDirectory: nextState.petSourceDirectory });
    onStateChange(nextState);
  }

  async function changePetFolder() {
    const picked = await gateway.pickDirectory();

    if (picked) {
      await applyPetSourceDirectory(picked);
    }
  }

  async function revealPetFolder() {
    if (state.petSourceDirectory) {
      await gateway.revealPath(state.petSourceDirectory).catch(() => {});
    }
  }

  // The folder shown as selected in the dropdown. There is no implicit default,
  // so an unset petSourceDirectory means "no folder chosen yet".
  const selectedPetFolder = state.petSourceDirectory ?? "";
  // A custom folder (picked via the OS browser) is not one of the well-known
  // options, so surface it as its own entry — mirrors the shell picker.
  const hasCustomPetFolder =
    selectedPetFolder.trim() !== "" &&
    !folderOptions.some((option) => option.path === selectedPetFolder);

  function selectPetFolderOption(value: string) {
    // The last entry opens the OS folder picker instead of designating a known
    // path; picking a folder there flows back through changePetFolder.
    if (value === BROWSE_FOLDER_VALUE) {
      void changePetFolder();
      return;
    }

    void applyPetSourceDirectory(value);
  }

  async function copyDefaultPetsIntoFolder() {
    setCopyingPets(true);
    try {
      await gateway.copyBundledPetsToSourceDirectory();
      // Refresh the "N looks found" count now rather than waiting for the poll.
      const packages = await gateway.listDesignatedPetPackages();
      setLooksFound(packages.length);
      setPetPackages(packages);
    } catch {
      // Non-fatal — the periodic rescan still reflects whatever landed.
    } finally {
      setCopyingPets(false);
    }
  }

  async function applyTerminalShell(value: string) {
    const trimmed = value.trim();
    const nextShell = trimmed ? trimmed : null;

    if (nextShell === state.terminalShell) {
      return;
    }

    // The picked shell also runs the double-click launch line, so rebuild it
    // around the command already stored instead of letting the two drift.
    const nextState = {
      ...state,
      terminalShell: nextShell,
      sessionCommand: buildLaunchLine(trimmed, parseLaunchLine(state.sessionCommand).command),
    };
    await gateway.updateSettings({
      terminalShell: nextState.terminalShell,
      sessionCommand: nextState.sessionCommand,
    });
    onStateChange(nextState);
  }

  const guide = GUIDE[step];
  const languageLabel = localeLabels[locale];
  const accentLabel = ACCENTS.find((candidate) => candidate.id === accent)?.name ?? "";
  const modeLabel =
    mode === "light"
      ? t("settings.themeLight")
      : mode === "dark"
        ? t("settings.themeDark")
        : t("settings.themeSystem");

  function pluginHint(plugin: typeof claudePlugin) {
    const key = `${plugin.provider}Plugin`;
    return !plugin.status
      ? t(`${key}.checking`)
      : plugin.status.state === "installed"
        ? t(`${key}.installedHint`)
        : plugin.status.state === "cli-missing"
          ? t(`${key}.cliMissing`)
          : plugin.status.state === "error"
            ? (plugin.status.error ?? t(`${key}.error`))
            : t(`${key}.notInstalledHint`);
  }

  const pluginRun = claudePlugin.run ?? codexPlugin.run;

  return (
    <main
      aria-label={t("setupWizard.pageAria")}
      style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--cream)" }}
    >
      <aside style={rail}>
        <Wordmark
          className="pd-onb__wordmark"
          style={railLogo}
          title={t("onboarding.wordmarkAlt")}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {CHECKLIST_STEPS.map((checklistStep, index) => {
            const currentIndex = CHECKLIST_STEPS.indexOf(step);
            const rowState =
              step === "done" || index < currentIndex
                ? "done"
                : index === currentIndex
                  ? "active"
                  : "upcoming";

            return (
              <button
                aria-current={rowState === "active" ? "step" : undefined}
                key={checklistStep}
                onClick={() => setStep(checklistStep)}
                style={{
                  ...stepRow(rowState),
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  font: "inherit",
                }}
                type="button"
              >
                <span style={stepBadge(rowState)}>{rowState === "done" ? "✓" : index + 1}</span>
                <div>
                  <div style={stepTitle}>{t(`setupWizard.checklist.${checklistStep}.title`)}</div>
                  <div style={stepDesc}>{t(`setupWizard.checklist.${checklistStep}.desc`)}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div style={guideCard}>
          <PetAvatar pet={guide.pet} size="md" />
          <div>
            <div style={guideName}>{t(`setupWizard.guideName.${guide.pet}`)}</div>
            <div style={guideQuote}>“{t(guide.quoteKey)}”</div>
          </div>
        </div>
      </aside>

      <div style={content}>
        <div style={topBar}>
          {step !== "done" && (
            <button onClick={onDone} style={skipAll} type="button">
              {t("setupWizard.skipAll")}
            </button>
          )}
        </div>

        {step === "welcome" && (
          <section style={body}>
            <div style={heroWrap}>
              <span style={eyebrow}>{t("setupWizard.welcomeEyebrow")}</span>
              <h1 style={title}>{t("setupWizard.welcomeTitle")}</h1>
              <p style={lede}>{t("setupWizard.welcomeLede")}</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={sectionLabel}>{t("settings.language")}</div>
              <div style={segWrap}>
                {locales.map((value) => (
                  <button
                    key={value}
                    onClick={() => setLocale(value)}
                    style={seg(locale === value)}
                    type="button"
                  >
                    {localeLabels[value]}
                  </button>
                ))}
              </div>

              <div style={sectionLabel}>{t("settings.defaultTerminal")}</div>
              <select
                aria-label={t("settings.defaultTerminal")}
                onChange={(event) => void applyTerminalShell(event.target.value)}
                style={wizardSelect}
                value={currentShell}
              >
                <option value="">{t("settings.defaultTerminalSystem")}</option>
                {shellOptions.map((option) => (
                  <option key={option.path} value={option.path}>
                    {option.label} ({option.path})
                  </option>
                ))}
                {hasCustomShell && <option value={currentShell}>{currentShell}</option>}
              </select>
              <p style={fieldHint}>{t("settings.defaultTerminalDesc")}</p>
            </div>

            <div style={footer}>
              <span style={{ ...stepDesc, fontSize: "13px" }}>
                {t("setupWizard.welcomeFineprint")}
              </span>
              <div style={footerActions}>
                <button onClick={onDone} style={textLink} type="button">
                  {t("setupWizard.skipForNow")}
                </button>
                <Button onClick={() => setStep("appearance")} size="lg">
                  {t("setupWizard.getStarted")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === "appearance" && (
          <section style={body}>
            <span style={eyebrow}>{t("setupWizard.appearanceEyebrow")}</span>
            <h1 style={title}>{t("setupWizard.appearanceTitle")}</h1>
            <p style={lede}>{t("setupWizard.appearanceLede")}</p>

            <div style={sectionLabel}>{t("settings.appearance")}</div>
            <div style={segWrap}>
              <button onClick={() => setMode("light")} style={seg(mode === "light")} type="button">
                ☀ {t("settings.themeLight")}
              </button>
              <button onClick={() => setMode("dark")} style={seg(mode === "dark")} type="button">
                ☾ {t("settings.themeDark")}
              </button>
              <button
                onClick={() => setMode("system")}
                style={seg(mode === "system")}
                type="button"
              >
                ◐ {t("settings.themeSystem")}
              </button>
            </div>

            <div style={sectionLabel}>{t("settings.accentColor")}</div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {ACCENTS.map((color) => (
                <button
                  aria-label={color.name}
                  key={color.id}
                  onClick={() => setAccent(color.id)}
                  style={swatch(color.hex, accent === color.id)}
                  title={color.name}
                  type="button"
                />
              ))}
            </div>

            <div style={footer}>
              <Button onClick={() => setStep("welcome")} variant="ghost">
                {t("onboarding.back")}
              </Button>
              <div style={footerActions}>
                <button onClick={() => setStep("petsFolder")} style={textLink} type="button">
                  {t("setupWizard.skipAppearance")}
                </button>
                <Button onClick={() => setStep("petsFolder")} size="lg">
                  {t("setupWizard.continue")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === "petsFolder" && (
          <section style={bodyTop}>
            <span style={eyebrow}>{t("setupWizard.petsFolderEyebrow")}</span>
            <h1 style={title}>{t("setupWizard.petsFolderTitle")}</h1>
            <p style={lede}>{t("setupWizard.petsFolderLede")}</p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {folderOptions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={sectionLabel}>{t("setupWizard.petFolderSelectLabel")}</div>
                    <span
                      className={`pd-onb__listen${
                        looksFound === null ? "" : " pd-onb__listen--ok"
                      }`}
                    >
                      <span
                        className={`pd-onb__listen-dot${
                          looksFound === null ? " pd-onb__listen-dot--pulse" : ""
                        }`}
                      />
                      {looksFound === null
                        ? t("setupWizard.petsFolderScanning")
                        : t("setupWizard.petsFolderCount", { count: looksFound })}
                    </span>
                  </div>
                  <select
                    aria-label={t("setupWizard.petFolderSelectLabel")}
                    onChange={(event) => selectPetFolderOption(event.target.value)}
                    style={wizardSelect}
                    value={selectedPetFolder}
                  >
                    <option disabled value="">
                      {t("setupWizard.petFolderSelectPlaceholder")}
                    </option>
                    {folderOptions.map((option) => (
                      <option key={option.kind} value={option.path}>
                        {t(`setupWizard.petFolderOption.${option.kind}`)} ({option.path})
                      </option>
                    ))}
                    {hasCustomPetFolder && (
                      <option value={selectedPetFolder}>
                        {t("setupWizard.petFolderOption.custom")} ({selectedPetFolder})
                      </option>
                    )}
                    <option value={BROWSE_FOLDER_VALUE}>{t("setupWizard.petFolderBrowse")}</option>
                  </select>
                  <p style={fieldHint}>{t("setupWizard.petFolderSelectHint")}</p>
                </div>
              )}

              {state.petSourceDirectory && (
                <div style={folderCountRow}>
                  <button
                    disabled={copyingPets}
                    onClick={() => void copyDefaultPetsIntoFolder()}
                    style={folderSelectButton}
                    title={t("setupWizard.copyDefaultPets")}
                    type="button"
                  >
                    <span aria-hidden style={folderIcon}>
                      🐾
                    </span>
                    <span style={folderSelectName}>
                      {copyingPets
                        ? t("setupWizard.copyingDefaultPets")
                        : t("setupWizard.copyDefaultPets")}
                    </span>
                  </button>
                  <button
                    onClick={() => void revealPetFolder()}
                    style={{
                      ...textLink,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    title={t("setupWizard.openPetFolder")}
                    type="button"
                  >
                    <ExternalLinkIcon size={15} />
                    {t("setupWizard.openPetFolder")}
                  </button>
                  <button
                    onClick={() => void applyPetSourceDirectory(null)}
                    style={{ ...textLink, textDecoration: "none" }}
                    type="button"
                  >
                    {t("setupWizard.clearPetFolder")}
                  </button>
                </div>
              )}

              {petPackages.length > 0 ? (
                <div style={{ marginTop: "12px" }}>
                  <PetLookStrip packages={petPackages} />
                </div>
              ) : looksFound !== null ? (
                <div style={emptyStrip}>{t("setupWizard.petsFolderEmpty")}</div>
              ) : null}

              {/* Ways to bring in more pets — below the folder, since they feed
                  into whichever folder is selected above. */}
              <div style={petGetActions}>
                <a
                  href={PETDEX_URL}
                  rel="noreferrer"
                  style={{ ...petGetButtonPrimary, flex: "1 1 0" }}
                  target="_blank"
                >
                  🐾 {t("setupWizard.petdexTitle")}
                </a>
                <button
                  onClick={() => setTerminalOpen(true)}
                  style={{ ...petGetButton, flex: "1 1 0" }}
                  type="button"
                >
                  <TerminalIcon size={16} />
                  {t("setupWizard.petdexAddViaTerminal")}
                </button>
              </div>
            </div>

            <div style={footer}>
              <Button onClick={() => setStep("appearance")} variant="ghost">
                {t("onboarding.back")}
              </Button>
              <div style={footerActions}>
                <button onClick={() => setStep("plugin")} style={textLink} type="button">
                  {t("setupWizard.skipPetsFolder")}
                </button>
                <Button onClick={() => setStep("plugin")} size="lg">
                  {t("setupWizard.continue")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === "plugin" && (
          <section style={bodyTop}>
            <span style={eyebrow}>{t("setupWizard.pluginEyebrow")}</span>
            <h1 style={title}>{t("setupWizard.pluginTitle")}</h1>
            <p style={lede}>{t("setupWizard.pluginLede")}</p>

            <div style={pluginGrid}>
              <div style={pluginCard(true, false)}>
                <span style={{ ...pluginBadge, background: "#D97757" }}>C</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", color: "var(--text-strong)", fontSize: "15px" }}>
                    {t("setupWizard.claudeName")}
                  </b>
                  <span style={pluginSubtitle} title={pluginHint(claudePlugin)}>
                    {pluginHint(claudePlugin)}
                  </span>
                </div>
                {claudePlugin.status?.state === "installed" ? (
                  <span className="pd-onb__connect-ok">✓ {t("claudePlugin.installed")}</span>
                ) : claudePlugin.status && claudePlugin.status.state !== "cli-missing" ? (
                  <Button disabled={claudePlugin.busy} onClick={() => claudePlugin.install()}>
                    {claudePlugin.busy
                      ? t("claudePlugin.installing")
                      : claudePlugin.status.state === "error"
                        ? t("claudePlugin.retry")
                        : t("claudePlugin.install")}
                  </Button>
                ) : null}
              </div>
              <div style={pluginCard(codexPlugin.status?.state === "installed", false)}>
                <span style={{ ...pluginBadge, background: "var(--ink-900)" }}>‹›</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", color: "var(--text-strong)", fontSize: "15px" }}>
                    {t("setupWizard.codexName")}
                  </b>
                  <span style={pluginSubtitle} title={pluginHint(codexPlugin)}>
                    {pluginHint(codexPlugin)}
                  </span>
                </div>
                {codexPlugin.status?.state === "installed" ? (
                  <span className="pd-onb__connect-ok">✓ {t("codexPlugin.installed")}</span>
                ) : codexPlugin.status && codexPlugin.status.state !== "cli-missing" ? (
                  <Button disabled={codexPlugin.busy} onClick={() => codexPlugin.install()}>
                    {codexPlugin.busy
                      ? t("codexPlugin.installing")
                      : codexPlugin.status.state === "error"
                        ? t("codexPlugin.retry")
                        : t("codexPlugin.install")}
                  </Button>
                ) : null}
              </div>
            </div>

            <div style={{ ...sectionLabel, margin: "20px 0 0" }}>
              {t("setupWizard.pluginTerminalLabel")}
            </div>
            <p style={fieldHint}>{t("setupWizard.pluginTerminalHint")}</p>
            <div style={inlineTermShell}>
              <TerminalSection
                available={isTauri()}
                initialCwd={state.petSourceDirectory ?? null}
                pickDirectory={() => gateway.pickDirectory()}
                shell={state.terminalShell}
              />
            </div>

            {/* An install opens over the step rather than replacing this shell,
                so the user keeps the terminal they were already using and the
                run is closed deliberately instead of being swapped away. */}
            {pluginRun && (
              <PluginRunTerminal
                available={isTauri()}
                onClose={
                  pluginRun.provider === "claude" ? claudePlugin.dismissRun : codexPlugin.dismissRun
                }
                run={pluginRun}
              />
            )}

            <div style={footer}>
              <Button onClick={() => setStep("petsFolder")} variant="ghost">
                {t("onboarding.back")}
              </Button>
              <div style={footerActions}>
                <button onClick={() => setStep("done")} style={textLink} type="button">
                  {t("setupWizard.connectLater")}
                </button>
                <Button onClick={() => setStep("done")} size="lg">
                  {t("setupWizard.finish")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === "done" && (
          <section style={{ ...body, alignItems: "center" }}>
            <div style={doneWrap}>
              <DoneHeroPet assetId="cato" />
              <span style={{ ...eyebrow, marginTop: "16px" }}>{t("setupWizard.doneEyebrow")}</span>
              <h1 style={title}>{t("setupWizard.doneTitle")}</h1>
              <div style={doneChips}>
                <span style={doneChip}>
                  {modeLabel} · {accentLabel} · {languageLabel}
                </span>
                <span style={doneChip}>
                  {looksFound === null
                    ? t("setupWizard.petsFolderScanning")
                    : t("setupWizard.petsFolderFound", { count: looksFound })}
                </span>
                <span style={doneChip}>
                  {claudePlugin.status?.state === "installed"
                    ? t("setupWizard.claudeConnected")
                    : t("setupWizard.claudeNotConnected")}
                </span>
                <span style={doneChip}>
                  {codexPlugin.status?.state === "installed"
                    ? t("setupWizard.codexConnected")
                    : t("setupWizard.codexNotConnected")}
                </span>
              </div>
              <div style={doneActions}>
                <Button onClick={onCreatePet} size="lg">
                  {t("setupWizard.createFirstPet")}
                </Button>
                <button onClick={onDone} style={textLink} type="button">
                  {t("setupWizard.goToHome")}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      <PetdexTerminalDialog
        available={isTauri()}
        cwd={state.petSourceDirectory ?? null}
        onClose={() => setTerminalOpen(false)}
        open={terminalOpen}
        shell={state.terminalShell}
      />
    </main>
  );
}
