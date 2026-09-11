import { TerminalPreview } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import {
  hint,
  inputStyle,
  label,
  rowStyle,
  selectStyle,
  smallCaps,
} from "@/app/main-window/settings-section.styles";
import { useTerminalPresets } from "@/app/main-window/use-terminal-presets";
import { useTerminalShellOptions } from "@/app/main-window/use-terminal-shell-options";
import { previewSessionLaunch } from "@/app/session-launch-line";

export interface SettingsTerminalPanelProps {
  command: string;
  onCommand: (value: string) => void;
  /**
   * The shell both the in-app terminal and the double-click launch line use;
   * empty string = OS default.
   */
  terminalShell: string;
  onTerminalShell: (value: string) => void;
  /**
   * The command line that opens a terminal, with `{cwd}` and `{command}` in it;
   * empty string = the system default (Windows Terminal, else a bare console).
   */
  terminalLaunch: string;
  onTerminalLaunch: (value: string) => void;
  preview: { prompt: string; command: string };
}

/** The folder a preview stands in for, since no pet is picked in Settings. */
const PREVIEW_FOLDER = "D:\\work\\proj";

/**
 * How a pet starts an agent: which terminal opens, what it runs, and — tucked
 * away — which shell wraps it.
 *
 * The terminal is a *command line*, not a mode. Detected terminals fill the
 * field when picked, but nothing here knows what a terminal is beyond the two
 * placeholders it substitutes, so one nobody thought of works by being typed
 * in. The shell is the third question and the one most people never have: a
 * terminal already has a shell of its own configured, and this one only decides
 * what wraps the agent (`cmd /k claude`, so the window survives the agent
 * exiting) and what the in-app terminal tab spawns.
 */
export function SettingsTerminalPanel({
  command,
  onCommand,
  terminalShell,
  onTerminalShell,
  terminalLaunch,
  onTerminalLaunch,
  preview,
}: SettingsTerminalPanelProps) {
  const { t } = useTranslation("desktop");
  const shellOptions = useTerminalShellOptions();
  const presets = useTerminalPresets();
  // A previously-saved shell that the current system probe didn't surface still
  // needs an entry so the dropdown can show what is actually persisted.
  const hasCustomShell =
    terminalShell.trim() !== "" && !shellOptions.some((option) => option.path === terminalShell);
  // The dropdown picks a starting point; the field below is the truth. Once the
  // line stops matching any preset it is simply the user's own.
  const matchedPreset = presets.find((option) => option.launch === terminalLaunch);

  return (
    <>
      <div style={rowStyle()}>
        <span style={label}>{t("settings.terminalApp")}</span>
        <p style={hint}>{t("settings.terminalAppDesc")}</p>
        <select
          aria-label={t("settings.terminalApp")}
          onChange={(event) => onTerminalLaunch(event.target.value)}
          style={{ ...selectStyle, width: "100%" }}
          value={terminalLaunch}
        >
          <option value="">{t("settings.defaultTerminalApp")}</option>
          {presets.map((option) => (
            <option key={option.launch} value={option.launch}>
              {option.label}
            </option>
          ))}
          {/* A line of the user's own is not one of the offered starting
              points, so the select says so rather than snapping back to the
              default and looking like the setting was lost. */}
          {terminalLaunch.trim() !== "" && !matchedPreset && (
            <option value={terminalLaunch}>{t("settings.customTerminalApp")}</option>
          )}
        </select>
        <input
          aria-label={t("settings.terminalLaunchLine")}
          onChange={(event) => onTerminalLaunch(event.target.value)}
          placeholder={t("settings.terminalLaunchPlaceholder")}
          style={{ ...inputStyle, width: "100%", marginTop: "8px" }}
          value={terminalLaunch}
        />
        <p style={hint}>{t("settings.terminalLaunchHint")}</p>
      </div>

      <div style={rowStyle()}>
        <span style={label}>{t("settings.command")}</span>
        <p style={hint}>{t("settings.commandDesc")}</p>
        <input
          aria-label={t("settings.command")}
          onChange={(event) => onCommand(event.target.value)}
          placeholder={t("settings.commandPlaceholder")}
          style={{ ...inputStyle, width: "100%" }}
          value={command}
        />
        <div style={{ marginTop: "16px" }}>
          <span style={smallCaps}>{t("settings.launchPreview")}</span>
          {/* Everything above it, resolved: the terminal's own line with the
              folder and the shell-wrapped agent substituted in. */}
          <TerminalPreview
            command={previewSessionLaunch(terminalLaunch, preview.command, PREVIEW_FOLDER)}
            prompt={terminalLaunch.trim() ? "" : preview.prompt}
          />
        </div>
      </div>

      <div style={rowStyle(true)}>
        {/* Closed by default: the shell matters to the in-app terminal tab and
            to what wraps the agent, and to nobody else. */}
        <details>
          <summary style={{ ...label, cursor: "pointer" }}>{t("settings.advanced")}</summary>
          <div style={{ marginTop: "14px" }}>
            <span style={label}>{t("settings.terminal")}</span>
            <p style={hint}>{t("settings.terminalDesc")}</p>
            <select
              aria-label={t("settings.terminal")}
              onChange={(event) => onTerminalShell(event.target.value)}
              style={{ ...selectStyle, width: "100%" }}
              value={terminalShell}
            >
              <option value="">{t("settings.defaultTerminalSystem")}</option>
              {shellOptions.map((option) => (
                <option key={option.path} value={option.path}>
                  {option.label} ({option.path})
                </option>
              ))}
              {hasCustomShell && <option value={terminalShell}>{terminalShell}</option>}
            </select>
          </div>
        </details>
      </div>
    </>
  );
}
