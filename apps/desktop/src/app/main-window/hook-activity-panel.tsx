import { useTranslation } from "@pets-driven/i18n";
import { type CSSProperties, useState } from "react";
import type { AgentHookIngressActivity } from "@/adapters/agent-events/agent-hook-ingress";

export interface HookActivityPanelProps {
  /** The loopback endpoint the hook script posts to; empty outside Tauri. */
  endpoint: string;
  /** The listener's bind failure, when it has one. */
  error: string | null;
  /** The last requests the ingress saw, newest first. */
  activity: AgentHookIngressActivity[];
  /** Requests turned away since the app started. */
  rejectedCount: number;
  /**
   * Post a synthetic hook through the real socket and resolve with the HTTP
   * status line. Rejects when the listener cannot be reached at all.
   */
  onSendTest: () => Promise<string>;
}

const disclosure: CSSProperties = {
  marginTop: "10px",
  border: "1px solid var(--border-soft)",
  borderRadius: "14px",
  background: "var(--surface-sunken)",
  padding: "10px 14px",
};
const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "12.5px",
  color: "var(--text-muted)",
  listStyle: "none",
};
const fieldRow: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "8px",
  marginTop: "10px",
};
const fieldName: CSSProperties = {
  flex: "none",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-subtle)",
};
const fieldValue: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  color: "var(--text-strong)",
  overflowWrap: "anywhere",
};
const testButton: CSSProperties = {
  border: 0,
  cursor: "pointer",
  padding: "7px 13px",
  borderRadius: "11px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "12.5px",
  background: "var(--surface-card)",
  color: "var(--text-strong)",
  whiteSpace: "nowrap",
};
const logList: CSSProperties = {
  margin: "8px 0 2px",
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  maxHeight: "168px",
  overflowY: "auto",
};
const logRow = (accepted: boolean): CSSProperties => ({
  display: "flex",
  gap: "10px",
  fontFamily: "var(--font-mono)",
  fontSize: "11.5px",
  color: accepted ? "var(--text-muted)" : "#d9544f",
});

function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString();
}

/**
 * The release build's stand-in for tailing the backend log.
 *
 * A packaged app has no console, so the ingress `eprintln!` traces go nowhere
 * and "my pets aren't reacting" has no visible cause. This panel answers the
 * three questions that would otherwise need one: where the hook script should
 * be posting, whether anything is arriving there, and — via the self-test —
 * whether the listener answers at all. Rejections are listed alongside
 * arrivals, because a hook that posts and bounces looks identical to no hook
 * when only successes are counted.
 *
 * Collapsed by default: it is a diagnostic, not part of the everyday screen.
 */
export function HookActivityPanel({
  endpoint,
  error,
  activity,
  rejectedCount,
  onSendTest,
}: HookActivityPanelProps) {
  const { t } = useTranslation("desktop");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  function runTest() {
    setTesting(true);
    setTestResult(null);
    onSendTest()
      .then((statusLine) => setTestResult(statusLine))
      .catch((testError: unknown) =>
        setTestResult(testError instanceof Error ? testError.message : String(testError)),
      )
      .finally(() => setTesting(false));
  }

  return (
    <details style={disclosure}>
      <summary style={summaryStyle}>{t("hook.diagnostics.title")}</summary>

      <div style={fieldRow}>
        <span style={fieldName}>{t("hook.diagnostics.endpoint")}</span>
        <span style={fieldValue}>{endpoint || t("hook.diagnostics.endpointUnknown")}</span>
      </div>

      {/* The bind failure itself, not the generic "try restarting" summary:
          "address already in use" names a second copy of the app, and nothing
          else in the UI ever says so. */}
      {error && (
        <div style={fieldRow}>
          <span style={fieldName}>{t("hook.diagnostics.errorLabel")}</span>
          <span style={{ ...fieldValue, color: "#d9544f" }}>{error}</span>
        </div>
      )}

      <div style={{ ...fieldRow, alignItems: "center", gap: "10px" }}>
        <button disabled={testing} onClick={runTest} style={testButton} type="button">
          {testing ? t("hook.diagnostics.testing") : t("hook.diagnostics.sendTest")}
        </button>
        {testResult && <span style={fieldValue}>{testResult}</span>}
      </div>

      <div style={{ marginTop: "14px" }}>
        <span style={fieldName}>
          {t("hook.diagnostics.recent")}
          {rejectedCount > 0 && ` · ${t("hook.diagnostics.rejected", { n: rejectedCount })}`}
        </span>
        {activity.length === 0 ? (
          <p style={{ ...fieldValue, margin: "8px 0 2px", color: "var(--text-muted)" }}>
            {t("hook.diagnostics.empty")}
          </p>
        ) : (
          <ul style={logList}>
            {activity.map((line, index) => (
              <li
                // Two hooks can land in the same millisecond with the same name,
                // so position in this newest-first window is the only stable key.
                // biome-ignore lint/suspicious/noArrayIndexKey: the timestamp alone is not unique; index disambiguates same-ms rows in a read-only window.
                key={`${line.at}-${index}`}
                style={logRow(line.accepted)}
              >
                <span>{clockTime(line.at)}</span>
                <span>{line.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
