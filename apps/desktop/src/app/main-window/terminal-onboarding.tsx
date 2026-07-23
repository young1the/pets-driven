import { useTranslation } from "@pets-driven/i18n";
import { useState } from "react";
import { PetPortrait } from "@/app/main-window/pet-portrait";
import "@/app/main-window/terminal-onboarding.css";

/** Skipped/finished state lives here so the coach only greets a user once. */
const DISMISSED_STORAGE_KEY = "pets-driven:terminal-onboarding-dismissed";

/** Order matters — this is the path we want a new user to walk. */
const SKILL_IDS = ["hatch", "bring", "attach", "carry"] as const;

/** The coach is Cato, regardless of which pets the user has adopted. */
const COACH_ASSET_ID = "cato";

function readDismissed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === "true";
}

export interface TerminalOnboardingControl {
  open: boolean;
  show: () => void;
  dismiss: () => void;
}

/**
 * Owns whether the coach is on screen, so the terminal toolbar can offer a
 * "tips" button that brings it back after it has been dismissed. Dismissing
 * persists; re-opening is per-session and deliberately does not clear the flag.
 *
 * `enabled` is the opt-in: surfaces that only borrow the terminal (the setup
 * wizard, for one) pass `false` and then the coach never shows *and* the
 * persisted flag is neither read nor written — otherwise skipping the coach
 * there would silently burn the one greeting the terminal tab owes the user.
 */
export function useTerminalOnboarding(enabled: boolean): TerminalOnboardingControl {
  const [open, setOpen] = useState(() => enabled && !readDismissed());

  return {
    open: enabled && open,
    show: () => {
      if (enabled) {
        setOpen(true);
      }
    },
    dismiss: () => {
      if (!enabled) {
        return;
      }
      setOpen(false);
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
    },
  };
}

/**
 * A speech bubble from Cato in the corner of the terminal tab, walking a new
 * user through the pets-driven skills one at a time. Overlays the live
 * terminal rather than blocking it.
 */
export function TerminalOnboarding({ dismiss }: { dismiss: () => void }) {
  const { t } = useTranslation("desktop");
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const skillId = SKILL_IDS[step];
  const example = t(`terminal.onboarding.skills.${skillId}.example`);
  const isLast = step + 1 >= SKILL_IDS.length;

  function copyExample() {
    void navigator.clipboard?.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="pd-term-onb">
      <div className="pd-term-onb__bubble">
        <div className="pd-term-onb__head">
          <span className="pd-term-onb__count">
            {step + 1} / {SKILL_IDS.length}
          </span>
          <button
            aria-label={t("terminal.onboarding.close")}
            className="pd-term-onb__close"
            onClick={dismiss}
            type="button"
          >
            ✕
          </button>
        </div>

        <p className="pd-term-onb__title">{t(`terminal.onboarding.skills.${skillId}.title`)}</p>
        <p className="pd-term-onb__blurb">{t(`terminal.onboarding.skills.${skillId}.blurb`)}</p>

        <button
          className="pd-term-onb__example"
          onClick={copyExample}
          title={t("terminal.onboarding.copyHint")}
          type="button"
        >
          {copied ? t("terminal.onboarding.copied") : example}
        </button>

        <div className="pd-term-onb__actions">
          <button onClick={dismiss} type="button">
            {t("terminal.onboarding.skip")}
          </button>
          <button
            className="pd-term-onb__next"
            onClick={() => (isLast ? dismiss() : setStep(step + 1))}
            type="button"
          >
            {isLast ? t("terminal.onboarding.start") : t("terminal.onboarding.next")}
          </button>
        </div>
      </div>

      <div aria-hidden className="pd-term-onb__pet">
        <PetPortrait assetId={COACH_ASSET_ID} height={78} name="Cato" width={72} />
      </div>
    </div>
  );
}
