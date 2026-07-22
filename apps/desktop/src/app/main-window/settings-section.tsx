import { type BadgeTone, FolderIcon, TerminalPreview } from "@pets-driven/design-system";
import { localeLabels, useTranslation } from "@pets-driven/i18n";
import type { CSSProperties } from "react";
import type { ClaudePluginStatus } from "@/app/desktop-gateway";
import { locales, useDesktopLocale } from "@/app/i18n/desktop-locale";
import { PluginRunTerminal } from "@/app/main-window/plugin-run-terminal";
import { useTerminalShellOptions } from "@/app/main-window/use-terminal-shell-options";
import { ACCENTS, useDesktopTheme } from "@/app/theme/desktop-theme";
import type { ClaudePluginRun } from "@/app/use-claude-plugin";

export interface SettingsSectionProps {
  command: string;
  onCommand: (value: string) => void;
  /**
   * The shell both the in-app terminal and the double-click launch line use;
   * empty string = OS default.
   */
  terminalShell: string;
  onTerminalShell: (value: string) => void;
  preview: { prompt: string; command: string };
  /** Hook ingress health, folded into the plugin card rather than shown alone. */
  hook: { tone: BadgeTone; summary: string };
  /** Bundled Claude Code plugin install state; null while the check runs. */
  plugin: ClaudePluginStatus | null;
  pluginBusy: boolean;
  /** An install/uninstall the in-app terminal is showing; null when idle. */
  pluginRun: ClaudePluginRun | null;
  /** Whether the app is running inside Tauri, so a PTY can be spawned. */
  terminalAvailable: boolean;
  onInstallPlugin: () => void;
  onUninstallPlugin: () => void;
  onClosePluginRun: () => void;
  /** The single folder scanned for pet packs; null = the Petdex default. */
  petSourceDirectory: string | null;
  /** The resolved Petdex default path shown when no custom folder is set. */
  defaultPetSourceDirectory: string | null;
  onChangePetFolder: () => void;
  onResetPetFolder: () => void;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);

  return parts[parts.length - 1] || path;
}

// Shared token-driven styles so the whole screen follows the app theme/accent.
const label: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "15.5px",
  color: "var(--text-strong)",
  margin: 0,
};
const hint: CSSProperties = {
  fontSize: "12.5px",
  color: "var(--text-muted)",
  margin: "4px 0 12px",
  lineHeight: 1.45,
};
const rowStyle = (last = false): CSSProperties => ({
  padding: "22px 0",
  borderBottom: last ? "none" : "1px solid var(--border-soft)",
});
const segWrap: CSSProperties = {
  display: "inline-flex",
  padding: "4px",
  gap: "4px",
  borderRadius: "12px",
  background: "var(--surface-sunken)",
  flexWrap: "wrap",
};
const seg = (active: boolean): CSSProperties => ({
  border: 0,
  cursor: "pointer",
  padding: "7px 16px",
  borderRadius: "9px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13px",
  background: active ? "var(--color-primary)" : "transparent",
  color: active ? "var(--color-on-primary)" : "var(--text-muted)",
  transition: "background 140ms ease, color 140ms ease",
});
const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: "border-box",
  border: "1.5px solid var(--border-default)",
  background: "var(--surface-card)",
  borderRadius: "12px",
  padding: "11px 14px",
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  color: "var(--text-strong)",
  outline: "none",
};
const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: "border-box",
  border: "1.5px solid var(--border-default)",
  background: "var(--surface-card)",
  borderRadius: "12px",
  padding: "11px 14px",
  fontFamily: "var(--font-body)",
  fontSize: "13px",
  color: "var(--text-strong)",
  cursor: "pointer",
  outline: "none",
};
const swatch = (hex: string, on: boolean): CSSProperties => ({
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  cursor: "pointer",
  background: hex,
  border: `3px solid ${on ? "var(--text-strong)" : "transparent"}`,
  boxShadow: on ? "0 0 0 3px var(--surface-card)" : "none",
  transition: "transform 140ms ease",
});
const connectionCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 14px",
  border: "1px solid var(--border-soft)",
  borderRadius: "14px",
  background: "var(--surface-sunken)",
};
const connectionText: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  flex: 1,
};
/** The trailing action buttons inside a card row (connection, pet folder). */
const smallAction: CSSProperties = {
  border: 0,
  cursor: "pointer",
  padding: "8px 14px",
  borderRadius: "12px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "12.5px",
  background: "var(--surface-card)",
  color: "var(--text-strong)",
  whiteSpace: "nowrap",
};
const TONE_COLORS: Partial<Record<BadgeTone, string>> = {
  success: "#2f9e63",
  info: "#3f82d9",
  danger: "#d9544f",
};
const statusDot = (tone: BadgeTone): CSSProperties => ({
  width: "10px",
  height: "10px",
  flex: "none",
  borderRadius: "999px",
  background: TONE_COLORS[tone] ?? "var(--text-muted)",
});
const smallCaps: CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: "0 0 8px",
};

export function SettingsSection({
  command,
  onCommand,
  terminalShell,
  onTerminalShell,
  preview,
  hook,
  plugin,
  pluginBusy,
  pluginRun,
  terminalAvailable,
  onInstallPlugin,
  onUninstallPlugin,
  onClosePluginRun,
  petSourceDirectory,
  defaultPetSourceDirectory,
  onChangePetFolder,
  onResetPetFolder,
}: SettingsSectionProps) {
  const { t } = useTranslation("desktop");
  const { locale, setLocale } = useDesktopLocale();
  const { mode, setMode, accent, setAccent } = useDesktopTheme();
  const shellOptions = useTerminalShellOptions();
  // A previously-saved shell that the current system probe didn't surface still
  // needs an entry so the dropdown can show what is actually persisted.
  const hasCustomShell =
    terminalShell.trim() !== "" && !shellOptions.some((option) => option.path === terminalShell);

  // The hook only says anything useful once the plugin exists to feed it, so
  // the two fold into a single line: what is installed, and whether the pets
  // are actually seeing the agent because of it.
  const installedLabel = plugin?.version
    ? t("claudePlugin.installedVersion", { version: plugin.version })
    : t("claudePlugin.installed");
  const pluginHintText = !plugin
    ? t("claudePlugin.checking")
    : plugin.state === "installed"
      ? `${installedLabel} — ${hook.summary}`
      : plugin.state === "cli-missing"
        ? t("claudePlugin.cliMissing")
        : plugin.state === "error"
          ? (plugin.error ?? t("claudePlugin.error"))
          : t("claudePlugin.notInstalledHint");
  const connectionTone: BadgeTone =
    !plugin || plugin.state === "cli-missing"
      ? "neutral"
      : plugin.state === "installed"
        ? hook.tone
        : plugin.state === "error"
          ? "danger"
          : "neutral";

  return (
    <div style={{ padding: "38px 24px 64px", minHeight: "100%" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "24px",
            color: "var(--text-strong)",
            margin: "0 0 3px",
          }}
        >
          {t("settings.title")}
        </h2>
        <p
          style={{
            fontSize: "13.5px",
            color: "var(--text-muted)",
            margin: "0 0 22px",
          }}
        >
          {t("settings.subtitle")}
        </p>

        <div
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-soft)",
            borderRadius: "22px",
            boxShadow: "var(--shadow-md)",
            padding: "4px 26px",
          }}
        >
          {/* Terminal — one shell for the in-app terminal and for the launch
              line a pet double-click runs, plus the agent command itself. */}
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
            <input
              aria-label={t("settings.command")}
              onChange={(event) => onCommand(event.target.value)}
              placeholder={t("settings.commandPlaceholder")}
              style={{ ...inputStyle, width: "100%", marginTop: "8px" }}
              value={command}
            />
            <div style={{ marginTop: "16px" }}>
              <span style={smallCaps}>{t("settings.commandPreview")}</span>
              <TerminalPreview command={preview.command} prompt={preview.prompt} />
            </div>
          </div>

          {/* Pet source folder — the single persisted scan root. */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.petSourcesTitle")}</span>
            <p style={hint}>{t("settings.petSourcesDesc")}</p>
            {/* Same card shape as the agent connection rows: the folder reads on
                the left, its actions sit alongside it rather than underneath. */}
            <div style={connectionCard}>
              <span style={{ color: "var(--text-muted)", display: "flex" }}>
                <FolderIcon />
              </span>
              <span style={connectionText}>
                <b style={{ color: "var(--text-strong)", fontSize: "13.5px" }}>
                  {petSourceDirectory
                    ? folderName(petSourceDirectory)
                    : t("settings.petdexDefaultFolder")}
                </b>
                <small
                  style={{
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {petSourceDirectory ?? defaultPetSourceDirectory ?? "~/.petdex/pets"}
                </small>
              </span>
              <button onClick={onChangePetFolder} style={smallAction} type="button">
                {t("settings.changePetFolder")}
              </button>
              {petSourceDirectory && (
                <button onClick={onResetPetFolder} style={smallAction} type="button">
                  {t("settings.resetPetFolder")}
                </button>
              )}
            </div>
          </div>

          {/* Agent connection — one card: the Claude Code plugin, and what it
              is (or is not) doing for the pets right now. */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.agentConnection")}</span>
            <p style={hint}>{t("settings.agentConnectionDesc")}</p>
            <div style={connectionCard}>
              <span aria-hidden style={statusDot(connectionTone)} />
              <span style={connectionText}>
                <b style={{ color: "var(--text-strong)", fontSize: "13.5px" }}>
                  {t("claudePlugin.title")}
                </b>
                <small style={{ color: "var(--text-muted)" }}>{pluginHintText}</small>
              </span>
              {plugin?.state === "installed" ? (
                <>
                  <button
                    disabled={pluginBusy}
                    onClick={onInstallPlugin}
                    style={smallAction}
                    type="button"
                  >
                    {pluginBusy ? t("claudePlugin.installing") : t("claudePlugin.reinstall")}
                  </button>
                  <button
                    disabled={pluginBusy}
                    onClick={onUninstallPlugin}
                    style={smallAction}
                    type="button"
                  >
                    {t("claudePlugin.uninstall")}
                  </button>
                </>
              ) : plugin && plugin.state !== "cli-missing" ? (
                <button
                  disabled={pluginBusy}
                  onClick={onInstallPlugin}
                  style={{
                    ...smallAction,
                    background: "var(--color-primary)",
                    color: "var(--color-on-primary)",
                  }}
                  type="button"
                >
                  {pluginBusy
                    ? t("claudePlugin.installing")
                    : plugin.state === "error"
                      ? t("claudePlugin.retry")
                      : t("claudePlugin.install")}
                </button>
              ) : null}
            </div>
            {pluginRun && (
              <PluginRunTerminal
                available={terminalAvailable}
                onClose={onClosePluginRun}
                run={pluginRun}
              />
            )}
          </div>

          {/* Appearance — flips the whole-app light/dark/system theme. */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.appearance")}</span>
            <p style={hint}>{t("settings.appearanceDesc")}</p>
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
          </div>

          {/* App accent color — recolors accents across the whole app. */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.accentColor")}</span>
            <p style={hint}>{t("settings.accentColorDesc")}</p>
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
          </div>

          {/* Language — real, persisted locale switch. */}
          <div style={rowStyle(true)}>
            <span style={label}>{t("settings.language")}</span>
            <div style={{ ...segWrap, marginTop: "11px" }}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
