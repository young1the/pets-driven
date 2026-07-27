import { useTranslation } from "@pets-driven/i18n";
import { lazy, Suspense } from "react";
import type { AgentPluginRun } from "@/app/use-agent-plugin";
import "@/app/main-window/terminal-section.css";
import "@/app/main-window/plugin-run-terminal.css";

// xterm is heavy and most sessions never install the plugin, so keep it out of
// the main chunk — same treatment as the terminal tab.
const EmbeddedTerminal = lazy(() =>
  import("@/app/main-window/embedded-terminal").then((m) => ({ default: m.EmbeddedTerminal })),
);

export interface PluginRunTerminalProps {
  run: AgentPluginRun;
  /** Whether the app is running inside Tauri (PTY available). */
  available: boolean;
  onClose: () => void;
}

/**
 * The plugin install/uninstall where the user can see it: a real shell with the
 * provider CLI line typed in, live output, and a prompt left behind so they can
 * answer a question, retry, or check things by hand.
 *
 * The line is typed in but *not* run. These commands install software, ask npx
 * for confirmation, and are awkward to undo — and answering that confirmation
 * assumes someone is at the keyboard anyway. So the app types, the user reads,
 * and Enter stays theirs.
 *
 * Deliberately spawns the OS default shell rather than the one picked in
 * settings — a shell like WSL has its own agent CLI install, which would not be
 * the one the status probes report on.
 */
export function PluginRunTerminal({ run, available, onClose }: PluginRunTerminalProps) {
  const { t } = useTranslation("desktop");

  return (
    <div className="pd-plugin-run">
      <div className="pd-eterm__frame">
        <div className="pd-eterm__bar">
          <span aria-hidden className="pd-eterm__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="pd-plugin-run__title">
            {t(`${run.provider}Plugin.run.${run.action}`)}
          </span>
          <button className="pd-eterm__restart" onClick={onClose} type="button">
            {t(`${run.provider}Plugin.run.close`)}
          </button>
        </div>

        {available ? (
          <>
            <p className="pd-plugin-run__hint">{t("terminal.reviewHint")}</p>
            <Suspense fallback={<div className="pd-eterm__view" />}>
              <EmbeddedTerminal
                className="pd-eterm__view"
                exitedLabel={t("terminal.exited")}
                key={run.line}
                prefill={run.line}
              />
            </Suspense>
          </>
        ) : (
          <div className="pd-eterm__unavailable">{t("terminal.unavailable")}</div>
        )}
      </div>
    </div>
  );
}
