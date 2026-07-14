import type { PetName } from "@pets-driven/design-system";
import { Button, PetAvatar } from "@pets-driven/design-system";
import { localeLabels, locales, useTranslation } from "@pets-driven/i18n";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { type CSSProperties, useEffect, useState } from "react";
import { type DesktopGateway, desktopGateway } from "@/app/desktop-gateway";
import { useDesktopLocale } from "@/app/i18n/desktop-locale";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";
import { Wordmark } from "@/app/onboarding/wordmark";
import { ACCENTS, useDesktopTheme } from "@/app/theme/desktop-theme";
import { useClaudePlugin } from "@/app/use-claude-plugin";
import {
  normalizeWorkingDirectoryPath,
  type PetsDrivenState,
  setPetSourceDirectory,
} from "@/app-state/pets-driven-state";

const PETDEX_URL = "https://petdex.dev";

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

const rail: CSSProperties = {
  width: "260px",
  flex: "none",
  background: "var(--surface-sunken)",
  borderRight: "1px solid var(--border-soft)",
  padding: "30px 22px",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
};
const railLogo: CSSProperties = { height: "20px", marginBottom: "26px" };
const stepRow = (state: "done" | "active" | "upcoming"): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "13px",
  opacity: state === "upcoming" ? 0.55 : 1,
});
const stepBadge = (state: "done" | "active" | "upcoming"): CSSProperties => ({
  width: "28px",
  height: "28px",
  flex: "none",
  borderRadius: "999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "13px",
  background: state === "upcoming" ? "var(--surface-card)" : "var(--color-primary)",
  color: state === "upcoming" ? "var(--text-muted)" : "var(--color-on-primary)",
  border: state === "upcoming" ? "2px solid var(--border-default)" : "none",
  boxShadow: state === "active" ? "0 0 0 4px var(--blossom-100)" : "none",
});
const stepTitle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "14px",
  color: "var(--text-strong)",
};
const stepDesc: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12px",
  color: "var(--text-muted)",
};
const guideCard: CSSProperties = {
  marginTop: "auto",
  display: "flex",
  alignItems: "center",
  gap: "11px",
  background: "var(--surface-card)",
  border: "1px solid var(--border-soft)",
  borderRadius: "16px",
  padding: "11px 13px",
  boxShadow: "var(--shadow-md)",
};
const guideName: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "13.5px",
  color: "var(--text-strong)",
};
const guideQuote: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12px",
  color: "var(--text-muted)",
  lineHeight: 1.35,
};
const content: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  padding: "26px 44px 36px",
  boxSizing: "border-box",
  minHeight: "100vh",
};
const topBar: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};
const skipAll: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13px",
  color: "var(--text-muted)",
};
const body: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "10px",
};
const eyebrow: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--color-primary)",
};
const title: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "clamp(30px, 4vw, 40px)",
  lineHeight: 1.06,
  letterSpacing: "-0.02em",
  color: "var(--text-strong)",
  margin: "6px 0 0",
};
const lede: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "15px",
  lineHeight: 1.55,
  color: "var(--text-muted)",
  margin: "12px 0 0",
  maxWidth: "480px",
};
const sectionLabel: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "14.5px",
  color: "var(--text-strong)",
  margin: "24px 0 10px",
};
const segWrap: CSSProperties = {
  display: "inline-flex",
  alignSelf: "flex-start",
  padding: "4px",
  gap: "4px",
  borderRadius: "12px",
  background: "var(--surface-sunken)",
  flexWrap: "wrap",
};
const seg = (active: boolean): CSSProperties => ({
  border: 0,
  cursor: "pointer",
  padding: "9px 18px",
  borderRadius: "9px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13.5px",
  background: active ? "var(--color-primary)" : "transparent",
  color: active ? "var(--color-on-primary)" : "var(--text-muted)",
});
const swatch = (hex: string, on: boolean): CSSProperties => ({
  width: "32px",
  height: "32px",
  borderRadius: "999px",
  cursor: "pointer",
  background: hex,
  border: `3px solid ${on ? "var(--text-strong)" : "transparent"}`,
  boxShadow: on ? "0 0 0 3px var(--surface-card)" : "none",
});
const footer: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "18px",
  marginTop: "auto",
  paddingTop: "22px",
};
const footerActions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "20px",
};
const textLink: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "14px",
  color: "var(--text-link)",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};
const folderRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "13px",
  padding: "13px 16px",
  borderRadius: "14px",
  border: "1px solid var(--border-soft)",
  background: "var(--surface-card)",
};
const petdexCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: "16px 18px",
  borderRadius: "16px",
  border: "2px solid var(--color-primary)",
  background: "var(--surface-card)",
  boxShadow: "0 0 0 4px var(--blossom-100)",
};
const petdexLink: CSSProperties = {
  flex: "none",
  padding: "10px 18px",
  borderRadius: "999px",
  background: "var(--color-primary)",
  color: "var(--color-on-primary)",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13.5px",
  textDecoration: "none",
};
const folderIcon: CSSProperties = {
  fontSize: "18px",
  flex: "none",
  color: "var(--text-strong)",
};
const folderText: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
};
const pluginGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  marginTop: "6px",
};
const pluginCard = (selected: boolean, disabled: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "14px 16px",
  borderRadius: "14px",
  border: selected ? "2px solid var(--color-primary)" : "1px solid var(--border-soft)",
  background: "var(--surface-card)",
  boxShadow: selected ? "0 0 0 4px var(--blossom-100)" : "none",
  opacity: disabled ? 0.6 : 1,
});
const pluginBadge: CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "17px",
  color: "#fff",
  flex: "none",
};
const heroWrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "4px",
};
const doneWrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: "4px",
  maxWidth: "480px",
  margin: "0 auto",
};
const doneChips: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "8px",
  marginTop: "16px",
};
const doneChip: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12.5px",
  fontWeight: 700,
  color: "var(--text-muted)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-soft)",
  padding: "6px 13px",
  borderRadius: "999px",
};
const doneActions: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "13px",
  marginTop: "26px",
};

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
  const claudePlugin = useClaudePlugin(gateway);
  const [step, setStep] = useState<WizardStep>("welcome");
  const [looksFound, setLooksFound] = useState<number | null>(null);
  const [defaultPetFolder, setDefaultPetFolder] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    void gateway.getDefaultPetSourceDirectory().then((path) => {
      if (isActive) {
        setDefaultPetFolder(path);
      }
    });

    return () => {
      isActive = false;
    };
  }, [gateway]);

  // Scan the pet roots for the "N looks found" count. On the pets-folder step
  // the scan repeats every few seconds, so installing a pet from Petdex and
  // switching back to the app updates the number without a manual refresh.
  // Background re-scans keep the last count on screen (no loading flicker);
  // only the very first scan shows the pulsing "looking…" state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: state.petSourceDirectory is an intentional re-scan trigger — it is not read in the body, but changing the pet folder must refresh the count immediately rather than waiting for the interval.
  useEffect(() => {
    let isActive = true;

    async function scan() {
      try {
        const packages = await gateway.listPetPackages();
        if (isActive) {
          setLooksFound(packages.length);
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

    await gateway.writePetsDrivenState(nextState);
    onStateChange(nextState);
  }

  async function changePetFolder() {
    const picked = await gateway.pickDirectory();

    if (picked) {
      await applyPetSourceDirectory(picked);
    }
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

  const pluginHint = !claudePlugin.status
    ? t("claudePlugin.checking")
    : claudePlugin.status.state === "installed"
      ? t("claudePlugin.installedHint")
      : claudePlugin.status.state === "cli-missing"
        ? t("claudePlugin.cliMissing")
        : claudePlugin.status.state === "error"
          ? (claudePlugin.status.error ?? t("claudePlugin.error"))
          : t("claudePlugin.notInstalledHint");

  return (
    <main
      aria-label={t("setupWizard.pageAria")}
      style={{ display: "flex", minHeight: "100vh", background: "var(--cream)" }}
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
              <div key={checklistStep} style={stepRow(rowState)}>
                <span style={stepBadge(rowState)}>{rowState === "done" ? "✓" : index + 1}</span>
                <div>
                  <div style={stepTitle}>{t(`setupWizard.checklist.${checklistStep}.title`)}</div>
                  <div style={stepDesc}>{t(`setupWizard.checklist.${checklistStep}.desc`)}</div>
                </div>
              </div>
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
          <section style={body}>
            <span style={eyebrow}>{t("setupWizard.petsFolderEyebrow")}</span>
            <h1 style={title}>{t("setupWizard.petsFolderTitle")}</h1>
            <p style={lede}>{t("setupWizard.petsFolderLede")}</p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              <div style={petdexCard}>
                <span aria-hidden style={{ fontSize: "26px", flex: "none" }}>
                  🐾
                </span>
                <span style={folderText}>
                  <b style={{ color: "var(--text-strong)", fontSize: "14.5px" }}>
                    {t("setupWizard.petdexTitle")}
                  </b>
                  <small style={{ color: "var(--text-muted)" }}>
                    {t("setupWizard.petdexBlurb")}
                  </small>
                </span>
                <a href={PETDEX_URL} rel="noreferrer" style={petdexLink} target="_blank">
                  {t("setupWizard.petdexOpen")}
                </a>
              </div>

              <div style={folderRow}>
                <span aria-hidden style={folderIcon}>
                  📁
                </span>
                <span style={folderText}>
                  <b style={{ color: "var(--text-strong)", fontSize: "14px" }}>
                    {state.petSourceDirectory
                      ? folderName(state.petSourceDirectory)
                      : t("setupWizard.petdexDefaultFolder")}
                  </b>
                  <small style={{ color: "var(--text-muted)" }}>
                    {state.petSourceDirectory ?? defaultPetFolder ?? "~/.petdex/pets"}
                  </small>
                </span>
                {state.petSourceDirectory && (
                  <button
                    onClick={() => void applyPetSourceDirectory(null)}
                    style={{ ...textLink, textDecoration: "none" }}
                    type="button"
                  >
                    {t("setupWizard.resetPetFolder")}
                  </button>
                )}
                <button
                  onClick={() => void changePetFolder()}
                  style={{ ...textLink, textDecoration: "none" }}
                  type="button"
                >
                  {t("setupWizard.changePetFolder")}
                </button>
              </div>

              <div className={`pd-onb__listen${looksFound === null ? "" : " pd-onb__listen--ok"}`}>
                <span
                  className={`pd-onb__listen-dot${
                    looksFound === null ? " pd-onb__listen-dot--pulse" : ""
                  }`}
                />
                {looksFound === null
                  ? t("setupWizard.petsFolderScanning")
                  : t("setupWizard.petsFolderFound", { count: looksFound })}
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
          <section style={body}>
            <span style={eyebrow}>{t("setupWizard.pluginEyebrow")}</span>
            <h1 style={title}>{t("setupWizard.pluginTitle")}</h1>
            <p style={lede}>{t("setupWizard.pluginLede")}</p>

            <div style={pluginGrid}>
              <div style={pluginCard(true, false)}>
                <span style={{ ...pluginBadge, background: "#D97757" }}>C</span>
                <div style={{ flex: 1 }}>
                  <b style={{ display: "block", color: "var(--text-strong)", fontSize: "15px" }}>
                    {t("setupWizard.claudeName")}
                  </b>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {t("setupWizard.claudeSubtitle")}
                  </span>
                </div>
              </div>
              <div style={pluginCard(false, true)}>
                <span style={{ ...pluginBadge, background: "var(--ink-900)" }}>‹›</span>
                <div style={{ flex: 1 }}>
                  <b style={{ display: "block", color: "var(--text-strong)", fontSize: "15px" }}>
                    {t("setupWizard.codexName")}
                  </b>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {t("setupWizard.comingSoon")}
                  </span>
                </div>
              </div>
            </div>

            <div className="pd-onb__connect-card" style={{ margin: "20px 0 0" }}>
              <span className="pd-onb__connect-text">
                <b>{t("claudePlugin.connectTitle")}</b>
                <small>{pluginHint}</small>
              </span>
              {claudePlugin.status?.state === "installed" ? (
                <span className="pd-onb__connect-ok">✓ {t("claudePlugin.installed")}</span>
              ) : claudePlugin.status && claudePlugin.status.state !== "cli-missing" ? (
                <Button disabled={claudePlugin.busy} onClick={() => void claudePlugin.install()}>
                  {claudePlugin.busy
                    ? t("claudePlugin.installing")
                    : claudePlugin.status.state === "error"
                      ? t("claudePlugin.retry")
                      : t("claudePlugin.install")}
                </Button>
              ) : null}
            </div>

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
    </main>
  );
}
