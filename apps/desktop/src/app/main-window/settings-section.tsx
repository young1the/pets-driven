import { type BadgeTone, FolderIcon, TerminalPreview } from "@pets-driven/design-system";
import { localeLabels, useTranslation } from "@pets-driven/i18n";
import { type CSSProperties, useState } from "react";
import type { ClaudePluginStatus } from "@/app/desktop-gateway";
import { locales, useDesktopLocale } from "@/app/i18n/desktop-locale";
import { LAUNCH_PROFILE_OPTIONS, type LaunchProfileId } from "@/app/session-launch-profile";
import { ACCENTS, useDesktopTheme } from "@/app/theme/desktop-theme";

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
  /** Bundled Claude Code plugin install state; null while the check runs. */
  plugin: ClaudePluginStatus | null;
  pluginBusy: boolean;
  onInstallPlugin: () => void;
  onUninstallPlugin: () => void;
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
const toggleRowStyle = (last = false): CSSProperties => ({
  ...rowStyle(last),
  display: "flex",
  alignItems: "center",
  gap: "14px",
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
const browseStyle: CSSProperties = {
  border: 0,
  cursor: "pointer",
  padding: "11px 18px",
  borderRadius: "12px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13px",
  background: "var(--surface-sunken)",
  color: "var(--text-strong)",
  whiteSpace: "nowrap",
};
const track = (on: boolean): CSSProperties => ({
  position: "relative",
  width: "46px",
  height: "27px",
  flex: "none",
  border: 0,
  cursor: "pointer",
  borderRadius: "999px",
  padding: 0,
  background: on ? "var(--color-primary)" : "var(--border-strong)",
  transition: "background 160ms ease",
});
const knob = (on: boolean): CSSProperties => ({
  position: "absolute",
  top: "3px",
  left: "3px",
  width: "21px",
  height: "21px",
  borderRadius: "999px",
  background: "#fff",
  boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
  transform: `translateX(${on ? "19px" : "0"})`,
  transition: "transform 180ms cubic-bezier(.22,1,.36,1)",
});
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
const smallAction: CSSProperties = {
  ...browseStyle,
  padding: "8px 14px",
  fontSize: "12.5px",
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
  launchProfile,
  command,
  launchLine,
  onLaunchProfile,
  onCommand,
  onLaunchLine,
  preview,
  hook,
  onReconnect,
  plugin,
  pluginBusy,
  onInstallPlugin,
  onUninstallPlugin,
  petSourceDirectory,
  defaultPetSourceDirectory,
  onChangePetFolder,
  onResetPetFolder,
}: SettingsSectionProps) {
  const { t } = useTranslation("desktop");
  const { locale, setLocale } = useDesktopLocale();
  const { mode, setMode, accent, setAccent } = useDesktopTheme();

  // Notifications, sound and the default folder are not yet backed by persisted
  // state — they live here as local UI placeholders until wired up.
  const [notify, setNotify] = useState(true);
  const [sound, setSound] = useState(true);
  const [defaultFolder, setDefaultFolder] = useState("~/projects");

  const customLaunchLine = launchProfile === "custom";

  const pluginHintText = !plugin
    ? t("claudePlugin.checking")
    : plugin.state === "installed"
      ? plugin.version
        ? t("claudePlugin.installedVersion", { version: plugin.version })
        : t("claudePlugin.installed")
      : plugin.state === "cli-missing"
        ? t("claudePlugin.cliMissing")
        : plugin.state === "error"
          ? (plugin.error ?? t("claudePlugin.error"))
          : t("claudePlugin.notInstalledHint");

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
          {/* Command — the agent shell run on double-click. */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.command")}</span>
            <p style={hint}>{t("settings.doubleClickDesc")}</p>
            <div style={segWrap}>
              {LAUNCH_PROFILE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onLaunchProfile(option.value)}
                  style={seg(launchProfile === option.value)}
                  type="button"
                >
                  {t(`launchProfile.${option.labelKey}`)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <input
                aria-label={customLaunchLine ? t("settings.launchLine") : t("settings.command")}
                onChange={(event) =>
                  customLaunchLine
                    ? onLaunchLine(event.target.value)
                    : onCommand(event.target.value)
                }
                placeholder={
                  customLaunchLine
                    ? '"…/bash.exe" -lc "claude; exec bash"'
                    : t("settings.commandPlaceholder")
                }
                style={inputStyle}
                value={customLaunchLine ? launchLine : command}
              />
            </div>
            {!customLaunchLine && (
              <details style={{ marginTop: "10px" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "var(--text-muted)",
                  }}
                >
                  {t("settings.advancedLaunchLine")}
                </summary>
                <input
                  aria-label={t("settings.launchLine")}
                  onChange={(event) => onLaunchLine(event.target.value)}
                  style={{ ...inputStyle, width: "100%", marginTop: "10px" }}
                  value={launchLine}
                />
              </details>
            )}
            <div style={{ marginTop: "16px" }}>
              <span style={smallCaps}>{t("settings.runsOnDoubleClick")}</span>
              <TerminalPreview
                command={preview.command}
                cwd={preview.cwd}
                prompt={preview.prompt}
              />
            </div>
          </div>

          {/* Default working folder (placeholder — not yet persisted). */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.defaultFolderTitle")}</span>
            <p style={hint}>{t("settings.defaultFolderDesc")}</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                onChange={(event) => setDefaultFolder(event.target.value)}
                style={inputStyle}
                value={defaultFolder}
              />
              <button style={browseStyle} type="button">
                {t("settings.browse")}
              </button>
            </div>
          </div>

          {/* Pet source folder — the single persisted scan root. */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.petSourcesTitle")}</span>
            <p style={hint}>{t("settings.petSourcesDesc")}</p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                border: "1px solid var(--border-soft)",
                borderRadius: "14px",
                background: "var(--surface-sunken)",
                marginBottom: "12px",
              }}
            >
              <span style={{ color: "var(--text-muted)", display: "flex" }}>
                <FolderIcon />
              </span>
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  flex: 1,
                }}
              >
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
              {petSourceDirectory && (
                <button
                  onClick={onResetPetFolder}
                  style={{
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontFamily: "inherit",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    padding: "6px",
                  }}
                  type="button"
                >
                  {t("settings.resetPetFolder")}
                </button>
              )}
            </div>
            <button
              onClick={onChangePetFolder}
              style={{
                ...browseStyle,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
              type="button"
            >
              <FolderIcon />
              {t("settings.changePetFolder")}
            </button>
          </div>

          {/* Agent connection — hook ingress status and the Claude Code
              plugin that forwards agent events into it. */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.agentConnection")}</span>
            <p style={hint}>{t("settings.agentConnectionDesc")}</p>
            <div style={connectionCard}>
              <span aria-hidden style={statusDot(hook.tone)} />
              <span style={connectionText}>
                <b style={{ color: "var(--text-strong)", fontSize: "13.5px" }}>{hook.label}</b>
                <small
                  style={{
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hook.summary}
                  {hook.url ? ` · ${hook.url}` : ""}
                </small>
              </span>
              <button onClick={onReconnect} style={smallAction} type="button">
                {t("settings.reconnect")}
              </button>
            </div>
            <div style={{ ...connectionCard, marginTop: "10px" }}>
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
          <div style={rowStyle()}>
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

          {/* Notifications (placeholder toggle). */}
          <div style={toggleRowStyle()}>
            <button
              aria-pressed={notify}
              onClick={() => setNotify((value) => !value)}
              style={track(notify)}
              type="button"
            >
              <span style={knob(notify)} />
            </button>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "14.5px",
                  color: "var(--text-strong)",
                }}
              >
                {t("settings.notifications")}
              </div>
              <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                {t("settings.notificationsDesc")}
              </div>
            </div>
          </div>

          {/* Sound effects (placeholder toggle). */}
          <div style={toggleRowStyle(true)}>
            <button
              aria-pressed={sound}
              onClick={() => setSound((value) => !value)}
              style={track(sound)}
              type="button"
            >
              <span style={knob(sound)} />
            </button>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "14.5px",
                  color: "var(--text-strong)",
                }}
              >
                {t("settings.sound")}
              </div>
              <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                {t("settings.soundDesc")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
