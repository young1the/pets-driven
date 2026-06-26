import {
  Input,
  SegmentedControl,
  Switch,
  TerminalPreview,
  type BadgeTone,
} from "@pets-driven/design-system";

export interface SettingsSectionProps {
  shell: string;
  command: string;
  onShell: (value: string) => void;
  onCommand: (value: string) => void;
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
  shell,
  command,
  onShell,
  onCommand,
  confirmRun,
  onToggleConfirm,
  preview,
}: SettingsSectionProps) {
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
            When you double-click a pet, it runs this command in its working
            folder.
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
                <span style={uppercaseLabel}>Shell</span>
                <SegmentedControl
                  onChange={onShell}
                  options={[
                    { value: "bash", label: "bash" },
                    { value: "cmd", label: "cmd" },
                  ]}
                  value={shell}
                />
              </div>
              <label style={{ flex: 1, minWidth: "240px" }}>
                <span style={uppercaseLabel}>Command</span>
                <Input
                  onChange={(event) => onCommand(event.target.value)}
                  placeholder="claude --resume"
                  value={command}
                />
              </label>
            </div>

            <div>
              <span style={uppercaseLabel}>Runs on double-click</span>
              <TerminalPreview
                command={preview.command}
                cwd={preview.cwd}
                prompt={preview.prompt}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                background: "var(--surface-sunken)",
                borderRadius: "14px",
              }}
            >
              <Switch
                checked={confirmRun}
                onChange={onToggleConfirm}
                size="sm"
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "14px",
                    color: "var(--text-strong)",
                  }}
                >
                  Ask before running
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                  Show a confirm dialog the first time each pet runs its
                  command.
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
