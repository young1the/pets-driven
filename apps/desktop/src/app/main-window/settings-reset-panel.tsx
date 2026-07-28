import { useTranslation } from "@pets-driven/i18n";
import { useState } from "react";
import { useDesktopLocale } from "@/app/i18n/desktop-locale";
import {
  dangerAction,
  hint,
  label,
  rowStyle,
  smallAction,
} from "@/app/main-window/settings-section.styles";
import { useDesktopTheme } from "@/app/theme/desktop-theme";

export interface SettingsResetPanelProps {
  /**
   * Put every persisted setting back to its default. Destructive enough to sit
   * behind the confirm step below, but it never removes a pet — see
   * `resetAllSettings` in app/desktop-host/use-pet-roster-actions.ts.
   */
  onResetAllSettings: () => void;
  /**
   * Remove every pet and return to onboarding. The counterpart to
   * `onResetAllSettings`: this one deletes the roster and leaves settings alone,
   * so it sits behind its own confirm — see `resetPets` in
   * app/desktop-host/use-pet-roster-actions.ts.
   */
  onResetPets: () => void;
}

/**
 * The two destructive actions, kept in their own category so nothing on the way
 * to an everyday setting passes over them. Each keeps its own two-step confirm,
 * and only one can be armed at a time, so a stray confirm can never hit the
 * wrong action.
 */
export function SettingsResetPanel({ onResetAllSettings, onResetPets }: SettingsResetPanelProps) {
  const { t } = useTranslation("desktop");
  const { reset: resetLocale } = useDesktopLocale();
  const { reset: resetTheme } = useDesktopTheme();
  // Step one of the two-step confirm: asking swaps the button for the confirm
  // card, so a single stray click can never reset anything. The two resets get
  // their own flag so opening one closes the other rather than arming both.
  const [resetAsked, setResetAsked] = useState(false);
  const [resetPetsAsked, setResetPetsAsked] = useState(false);

  // Appearance and language live in these providers rather than in the state
  // document, so the reset has to tell them directly — otherwise the screen
  // would keep the old theme until the app restarts.
  function confirmResetAllSettings() {
    setResetAsked(false);
    resetTheme();
    resetLocale();
    onResetAllSettings();
  }

  function confirmResetPets() {
    setResetPetsAsked(false);
    onResetPets();
  }

  return (
    <div style={rowStyle(true)}>
      <span style={label}>{t("settings.resetAll")}</span>
      <p style={hint}>{t("settings.resetAllDesc")}</p>
      {resetAsked ? (
        <div className="pd-settings-confirm">
          <span className="pd-settings-confirm__copy">
            <b className="pd-settings-confirm__title">{t("settings.resetAllConfirmTitle")}</b>
            <small className="pd-settings-confirm__hint">{t("settings.resetAllConfirmHint")}</small>
          </span>
          <button onClick={() => setResetAsked(false)} style={smallAction} type="button">
            {t("settings.resetAllCancel")}
          </button>
          <button onClick={confirmResetAllSettings} style={dangerAction} type="button">
            {t("settings.resetAllConfirm")}
          </button>
        </div>
      ) : resetPetsAsked ? (
        <div className="pd-settings-confirm">
          <span className="pd-settings-confirm__copy">
            <b className="pd-settings-confirm__title">{t("settings.resetPetsConfirmTitle")}</b>
            <small className="pd-settings-confirm__hint">
              {t("settings.resetPetsConfirmHint")}
            </small>
          </span>
          <button onClick={() => setResetPetsAsked(false)} style={smallAction} type="button">
            {t("settings.resetPetsCancel")}
          </button>
          <button onClick={confirmResetPets} style={dangerAction} type="button">
            {t("settings.resetPetsConfirm")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setResetPetsAsked(false);
              setResetAsked(true);
            }}
            style={dangerAction}
            type="button"
          >
            {t("settings.resetAllAction")}
          </button>
          <button
            onClick={() => {
              setResetAsked(false);
              setResetPetsAsked(true);
            }}
            style={dangerAction}
            type="button"
          >
            {t("settings.resetPetsAction")}
          </button>
        </div>
      )}
    </div>
  );
}
