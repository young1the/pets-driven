import type { ReactNode } from "react";
import {
  Input,
  Select,
  Switch,
  TerminalPreview,
  type BadgeTone,
} from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import {
  LAUNCH_PROFILE_OPTIONS,
  type LaunchProfileId,
} from "@/app/session-launch-profile";

export interface SettingsSectionProps {
  launchProfile: LaunchProfileId;
  command: string;
  launchLine: string;
  onLaunchProfile: (value: LaunchProfileId) => void;
  onCommand: (value: string) => void;
  onLaunchLine: (value: string) => void;
  preview: { cwd: string; prompt: string; command: string };
  hook: { tone: BadgeTone; label: string; summary: string; url: string };
  onReconnect: () => void;
  /** Optional language picker, injected by the app (needs the locale context). */
  languageSwitcher?: ReactNode;
}

const uppercaseLabel = {
  display: "block",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-subtle)",
  marginBottom: "7px",
};

const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-soft)",
  borderRadius: "22px",
  boxShadow: "var(--shadow-md)",
  padding: "22px 24px",
};

export function SettingsSection({
  launchProfile,
  command,
  launchLine,
  onLaunchProfile,
  onCommand,
  onLaunchLine,
  preview,
  languageSwitcher,
}: SettingsSectionProps) {
  const { t } = useTranslation("desktop");
  const customLaunchLine = launchProfile === "custom";
  const launchProfileOptions = LAUNCH_PROFILE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`launchProfile.${option.labelKey}`),
  }));

  return (
    <div style={{ padding: "38px 24px 64px" }}>
      <div style={{ maxWidth: "840px", margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "24px",
            color: "var(--text-strong)",
            margin: "0 0 18px",
          }}
        >
          {t("settings.title")}
        </h2>

        <div style={{ ...cardStyle, marginBottom: "20px" }}>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "17px",
              color: "var(--text-strong)",
              margin: "0 0 5px",
            }}
          >
            {t("settings.doubleClickTitle")}
          </h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              margin: "0 0 18px",
              lineHeight: 1.45,
            }}
          >
            {t("settings.doubleClickDesc")}
          </p>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <Select
                  label={t("settings.shell")}
                  onChange={(event) =>
                    onLaunchProfile(event.target.value as LaunchProfileId)
                  }
                  options={launchProfileOptions}
                  value={launchProfile}
                />
              </div>
              <div style={{ flex: 1, minWidth: "280px" }}>
                <Input
                  label={
                    customLaunchLine
                      ? t("settings.launchLine")
                      : t("settings.command")
                  }
                  onChange={(event) =>
                    customLaunchLine
                      ? onLaunchLine(event.target.value)
                      : onCommand(event.target.value)
                  }
                  placeholder={
                    customLaunchLine
                      ? '"C:\\Program Files\\Git\\bin\\bash.exe" -lc "claude; exec bash"'
                      : t("settings.commandPlaceholder")
                  }
                  value={customLaunchLine ? launchLine : command}
                />
              </div>
            </div>

            {!customLaunchLine && (
              <details
                style={{
                  border: "1px solid var(--border-soft)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  background: "var(--surface-sunken)",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "12.5px",
                    fontWeight: 800,
                    color: "var(--text-muted)",
                  }}
                >
                  {t("settings.advancedLaunchLine")}
                </summary>
                <div style={{ marginTop: "12px" }}>
                  <Input
                    label={t("settings.launchLine")}
                    onChange={(event) => onLaunchLine(event.target.value)}
                    value={launchLine}
                  />
                </div>
              </details>
            )}

            <div>
              <span style={uppercaseLabel}>{t("settings.runsOnDoubleClick")}</span>
              <TerminalPreview
                command={preview.command}
                cwd={preview.cwd}
                prompt={preview.prompt}
              />
            </div>

          </div>
        </div>

        {languageSwitcher ? (
          <div style={cardStyle}>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "17px",
                color: "var(--text-strong)",
                margin: "0 0 5px",
              }}
            >
              {t("settings.language")}
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                margin: "0 0 18px",
                lineHeight: 1.45,
              }}
            >
              {t("settings.languageDesc")}
            </p>
            <div style={{ maxWidth: "280px" }}>{languageSwitcher}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
