import type { BadgeTone } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import type { AgentHookIngressActivity } from "@/adapters/agent-events/agent-hook-ingress";
import type { AgentPluginProvider, AgentPluginStatus } from "@/app/desktop-gateway";
import { HookActivityPanel } from "@/app/main-window/hook-activity-panel";
import { PluginRunTerminal } from "@/app/main-window/plugin-run-terminal";
import {
  connectionCard,
  connectionText,
  hint,
  label,
  rowStyle,
  smallAction,
  statusDot,
} from "@/app/main-window/settings-section.styles";
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

export interface SettingsAgentPanelProps {
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
}

/**
 * One card per Agent Source, with one shared ingress diagnostic because every
 * provider enters the same feed.
 */
export function SettingsAgentPanel({ hook, plugins, terminalAvailable }: SettingsAgentPanelProps) {
  const { t } = useTranslation("desktop");
  const activeRun = plugins.find((connection) => connection.run);

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
    <div style={rowStyle(true)}>
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
              {connection.provider === "codex" && connection.status?.state === "installed" && (
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
      {/* One at a time: the run is a modal, so the buttons that could start the
          other provider's are unreachable until it closes. */}
      {activeRun?.run && (
        <PluginRunTerminal
          available={terminalAvailable}
          onClose={activeRun.onCloseRun}
          run={activeRun.run}
        />
      )}
    </div>
  );
}
