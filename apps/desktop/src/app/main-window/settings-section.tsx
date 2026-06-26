import {
  Input,
  Select,
  Switch,
  TerminalPreview,
  type BadgeTone,
} from "@pets-driven/design-system";
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
  confirmRun: boolean;
  onToggleConfirm: () => void;
  preview: { cwd: string; prompt: string; command: string };
  hook: { tone: BadgeTone; label: string; summary: string; url: string };
  onReconnect: () => void;
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
  confirmRun,
  onToggleConfirm,
  preview,
}: SettingsSectionProps) {
  const customLaunchLine = launchProfile === "custom";

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
          Settings
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
            Double-click action
          </h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              margin: "0 0 18px",
              lineHeight: 1.45,
            }}
          >
            When you double-click a pet, it opens this terminal command in its
            working folder.
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
                  label="Shell"
                  onChange={(event) =>
                    onLaunchProfile(event.target.value as LaunchProfileId)
                  }
                  options={LAUNCH_PROFILE_OPTIONS}
                  value={launchProfile}
                />
              </div>
              <div style={{ flex: 1, minWidth: "280px" }}>
                <Input
                  label={customLaunchLine ? "Launch line" : "Command"}
                  onChange={(event) =>
                    customLaunchLine
                      ? onLaunchLine(event.target.value)
                      : onCommand(event.target.value)
                  }
                  placeholder={
                    customLaunchLine
                      ? '"C:\\Program Files\\Git\\bin\\bash.exe" -lc "claude; exec bash"'
                      : "claude --resume"
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
                  Advanced launch line
                </summary>
                <div style={{ marginTop: "12px" }}>
                  <Input
                    label="Launch line"
                    onChange={(event) => onLaunchLine(event.target.value)}
                    value={launchLine}
                  />
                </div>
              </details>
            )}

            <div>
              <span style={uppercaseLabel}>Runs on double-click</span>
              <TerminalPreview
                command={preview.command}
                cwd={preview.cwd}
                prompt={preview.prompt}
              />
            </div>

            <div>
              <Switch
                checked={confirmRun}
                className="pd-settings-confirm"
                onChange={onToggleConfirm}
                size="sm"
              >
                <span className="pd-settings-confirm__copy">
                  <span className="pd-settings-confirm__title">
                    Ask before running
                  </span>
                  <span className="pd-settings-confirm__hint">
                    Show a confirm dialog the first time each pet runs its
                    command.
                  </span>
                </span>
              </Switch>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
