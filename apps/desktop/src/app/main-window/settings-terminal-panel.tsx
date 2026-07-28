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
import { useTerminalShellOptions } from "@/app/main-window/use-terminal-shell-options";

export interface SettingsTerminalPanelProps {
  command: string;
  onCommand: (value: string) => void;
  /**
   * The shell both the in-app terminal and the double-click launch line use;
   * empty string = OS default.
   */
  terminalShell: string;
  onTerminalShell: (value: string) => void;
  preview: { prompt: string; command: string };
}

/** How a pet starts an agent: which shell, and what it types into it. */
export function SettingsTerminalPanel({
  command,
  onCommand,
  terminalShell,
  onTerminalShell,
  preview,
}: SettingsTerminalPanelProps) {
  const { t } = useTranslation("desktop");
  const shellOptions = useTerminalShellOptions();
  // A previously-saved shell that the current system probe didn't surface still
  // needs an entry so the dropdown can show what is actually persisted.
  const hasCustomShell =
    terminalShell.trim() !== "" && !shellOptions.some((option) => option.path === terminalShell);

  return (
    <>
      <div style={rowStyle()}>
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

      <div style={rowStyle(true)}>
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
          <span style={smallCaps}>{t("settings.commandPreview")}</span>
          <TerminalPreview command={preview.command} prompt={preview.prompt} />
        </div>
      </div>
    </>
  );
}
