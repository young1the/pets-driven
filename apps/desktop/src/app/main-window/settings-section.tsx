import {
  type BadgeTone,
  ExternalLinkIcon,
  FolderIcon,
  TerminalPreview,
} from "@pets-driven/design-system";
import { localeLabels, useTranslation } from "@pets-driven/i18n";
import { useState } from "react";
import type { AgentHookIngressActivity } from "@/adapters/agent-events/agent-hook-ingress";
import type { AgentPluginProvider, AgentPluginStatus } from "@/app/desktop-gateway";
import { locales, useDesktopLocale } from "@/app/i18n/desktop-locale";
import { HookActivityPanel } from "@/app/main-window/hook-activity-panel";
import { PluginRunTerminal } from "@/app/main-window/plugin-run-terminal";
import {
  connectionCard,
  connectionText,
  dangerAction,
  hint,
  inputStyle,
  label,
  rowStyle,
  seg,
  segWrap,
  selectStyle,
  smallAction,
  smallCaps,
  statusDot,
  swatch,
} from "@/app/main-window/settings-section.styles";
import { useTerminalShellOptions } from "@/app/main-window/use-terminal-shell-options";
import { ACCENTS, useDesktopTheme } from "@/app/theme/desktop-theme";
import type { AgentPluginRun } from "@/app/use-agent-plugin";

export type AgentPluginConnection = {
  provider: AgentPluginProvider;
  status: AgentPluginStatus | null;
  busy: boolean;
  run: AgentPluginRun | null;
  onInstall: () => void;
  onUninstall: () => void;
  onCloseRun: () => void;
};

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
  /**
   * Hook ingress health, folded into the plugin card rather than shown alone.
   * `summary` says whether the listener is up; `lastSignal` is the one line
   * that says whether a hook actually arrived, and it is the only place a
   * release build can answer that — keep it out of the dev-only debug tab.
   * The rest feeds the collapsed diagnostics panel below the card, for when
   * that one line says "nothing has arrived yet" and the user needs to know why.
   */
  hook: {
    tone: BadgeTone;
    summary: string;
    lastSignal: string;
    endpoint: string;
    error: string | null;
    activity: AgentHookIngressActivity[];
    rejectedCount: number;
    onSendTest: () => Promise<string>;
  };
  /** The bundled Agent Source plugins and their provider-owned install state. */
  plugins: AgentPluginConnection[];
  /** Whether the app is running inside Tauri, so a PTY can be spawned. */
  terminalAvailable: boolean;
  /** The single folder scanned for pet packs; null = no folder designated. */
  petSourceDirectory: string | null;
  onChangePetFolder: () => void;
  /** Reveal the designated pet folder in Explorer. Only shown when one is set. */
  onOpenPetFolder: () => void;
  /** Clear the designated folder, dropping back to the bundled pets alone. */
  onResetPetFolder: () => void;
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

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);

  return parts[parts.length - 1] || path;
}

export function SettingsSection({
  command,
  onCommand,
  terminalShell,
  onTerminalShell,
  preview,
  hook,
  plugins,
  terminalAvailable,
  petSourceDirectory,
  onChangePetFolder,
  onOpenPetFolder,
  onResetPetFolder,
  onResetAllSettings,
  onResetPets,
}: SettingsSectionProps) {
  const { t } = useTranslation("desktop");
  const { locale, setLocale, reset: resetLocale } = useDesktopLocale();
  const { mode, setMode, accent, setAccent, reset: resetTheme } = useDesktopTheme();
  const shellOptions = useTerminalShellOptions();
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
  // A previously-saved shell that the current system probe didn't surface still
  // needs an entry so the dropdown can show what is actually persisted.
  const hasCustomShell =
    terminalShell.trim() !== "" && !shellOptions.some((option) => option.path === terminalShell);

  function pluginPresentation(connection: AgentPluginConnection) {
    const { provider, status } = connection;
    const key = `${provider}Plugin`;
    const installedLabel = status?.version
      ? t(`${key}.installedVersion`, { version: status.version })
      : t(`${key}.installed`);
    const text = !status
      ? t(`${key}.checking`)
      : status.state === "installed"
        ? `${installedLabel} — ${hook.summary}`
        : status.state === "cli-missing"
          ? t(`${key}.cliMissing`)
          : status.state === "error"
            ? (status.error ?? t(`${key}.error`))
            : t(`${key}.notInstalledHint`);
    const tone: BadgeTone =
      !status || status.state === "cli-missing"
        ? "neutral"
        : status.state === "installed"
          ? hook.tone
          : status.state === "error"
            ? "danger"
            : "neutral";

    return { key, text, tone };
  }

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
                  {petSourceDirectory ? folderName(petSourceDirectory) : t("settings.noPetFolder")}
                </b>
                <small
                  style={{
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {petSourceDirectory ?? t("settings.noPetFolderHint")}
                </small>
              </span>
              {petSourceDirectory && (
                <button
                  onClick={onOpenPetFolder}
                  style={{
                    ...smallAction,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  title={t("settings.openPetFolder")}
                  type="button"
                >
                  <ExternalLinkIcon size={14} />
                  {t("settings.openPetFolder")}
                </button>
              )}
              <button onClick={onChangePetFolder} style={smallAction} type="button">
                {t("settings.changePetFolder")}
              </button>
              {petSourceDirectory && (
                <button onClick={onResetPetFolder} style={smallAction} type="button">
                  {t("settings.clearPetFolder")}
                </button>
              )}
            </div>
          </div>

          {/* Agent connection — one card per Agent Source, with one shared
              ingress diagnostic because every provider enters the same feed. */}
          <div style={rowStyle()}>
            <span style={label}>{t("settings.agentConnection")}</span>
            <p style={hint}>{t("settings.agentConnectionDesc")}</p>
            {plugins.map((connection) => {
              const presentation = pluginPresentation(connection);

              return (
                <div key={connection.provider} style={connectionCard}>
                  <span aria-hidden style={statusDot(presentation.tone)} />
                  <span style={connectionText}>
                    <b style={{ color: "var(--text-strong)", fontSize: "13.5px" }}>
                      {t(`${presentation.key}.title`)}
                    </b>
                    <small style={{ color: "var(--text-muted)" }}>{presentation.text}</small>
                    {connection.provider === "codex" &&
                      connection.status?.state === "installed" && (
                        <small style={{ color: "var(--text-subtle)", marginTop: "3px" }}>
                          {t("codexPlugin.hookTrustHint")}
                        </small>
                      )}
                  </span>
                  {connection.status?.state === "installed" ? (
                    <>
                      <button
                        disabled={connection.busy}
                        onClick={connection.onInstall}
                        style={smallAction}
                        type="button"
                      >
                        {connection.busy
                          ? t(`${presentation.key}.installing`)
                          : t(`${presentation.key}.reinstall`)}
                      </button>
                      <button
                        disabled={connection.busy}
                        onClick={connection.onUninstall}
                        style={smallAction}
                        type="button"
                      >
                        {t(`${presentation.key}.uninstall`)}
                      </button>
                    </>
                  ) : connection.status && connection.status.state !== "cli-missing" ? (
                    <button
                      disabled={connection.busy}
                      onClick={connection.onInstall}
                      style={{
                        ...smallAction,
                        background: "var(--color-primary)",
                        color: "var(--color-on-primary)",
                      }}
                      type="button"
                    >
                      {connection.busy
                        ? t(`${presentation.key}.installing`)
                        : connection.status.state === "error"
                          ? t(`${presentation.key}.retry`)
                          : t(`${presentation.key}.install`)}
                    </button>
                  ) : null}
                </div>
              );
            })}
            <small style={{ color: "var(--text-subtle)" }}>{hook.lastSignal}</small>
            <HookActivityPanel
              activity={hook.activity}
              endpoint={hook.endpoint}
              error={hook.error}
              onSendTest={hook.onSendTest}
              rejectedCount={hook.rejectedCount}
            />
            {plugins.map(
              (connection) =>
                connection.run && (
                  <PluginRunTerminal
                    available={terminalAvailable}
                    key={connection.provider}
                    onClose={connection.onCloseRun}
                    run={connection.run}
                  />
                ),
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

          {/* Reset — two destructive actions share this last row: settings only,
              or the whole pet roster. Each keeps its own two-step confirm, and
              only one can be armed at a time, so a stray confirm can never hit
              the wrong action. */}
          <div style={rowStyle(true)}>
            <span style={label}>{t("settings.resetAll")}</span>
            <p style={hint}>{t("settings.resetAllDesc")}</p>
            {resetAsked ? (
              <div className="pd-settings-confirm">
                <span className="pd-settings-confirm__copy">
                  <b className="pd-settings-confirm__title">{t("settings.resetAllConfirmTitle")}</b>
                  <small className="pd-settings-confirm__hint">
                    {t("settings.resetAllConfirmHint")}
                  </small>
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
                  <b className="pd-settings-confirm__title">
                    {t("settings.resetPetsConfirmTitle")}
                  </b>
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
        </div>
      </div>
    </div>
  );
}
