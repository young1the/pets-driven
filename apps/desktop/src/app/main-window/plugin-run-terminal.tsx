import { Button, Dialog } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { lazy, Suspense, useState } from "react";
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
 * It is a modal because an install is one thing at a time: the surface behind
 * it — a settings card, an onboarding step — keeps its own layout, and the
 * other provider's buttons are out of reach until this run is closed, so two
 * terminals can never sit there prefilled with the user unsure which one their
 * Enter goes to. Closing is deliberate (button or footer): Escape belongs to
 * whatever is running in the shell, and a stray scrim click must not kill an
 * install midway.
 *
 * While the command is running, closing gets a confirm in front of it — the
 * close tears down the PTY, which mid-install leaves the plugin half written.
 * Before Enter, and again once the install has finished and the shell is back
 * at its prompt, there is nothing to lose, so it closes straight away.
 *
 * Deliberately spawns the OS default shell rather than the one picked in
 * settings — a shell like WSL has its own agent CLI install, which would not be
 * the one the status probes report on.
 */
export function PluginRunTerminal({ run, available, onClose }: PluginRunTerminalProps) {
  const { t } = useTranslation("desktop");
  const [running, setRunning] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  function handleRunningChange(next: boolean) {
    setRunning(next);
    // The command finished while the confirm was up, so the thing it was
    // guarding is gone — drop the question rather than leave it asking about a
    // run that is already over.
    if (!next) {
      setConfirmingClose(false);
    }
  }

  function requestClose() {
    if (running) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }

  return (
    <Dialog
      className="pd-plugin-run-dialog"
      dismissible={false}
      footer={
        confirmingClose ? (
          <div className="pd-plugin-run__confirm">
            <p className="pd-plugin-run__confirm-hint">{t("terminal.confirmClose.hint")}</p>
            <div className="pd-plugin-run__confirm-actions">
              <Button onClick={() => setConfirmingClose(false)} variant="ghost">
                {t("terminal.confirmClose.keep")}
              </Button>
              <Button onClick={onClose} variant="neutral">
                {t("terminal.confirmClose.close")}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={requestClose} variant="ghost">
            {t(`${run.provider}Plugin.run.close`)}
          </Button>
        )
      }
      onClose={requestClose}
      open
      title={t(`${run.provider}Plugin.title`)}
    >
      <p className="pd-plugin-run__hint">{t("terminal.reviewHint")}</p>

      <div className="pd-plugin-run__frame">
        <div className="pd-eterm__bar">
          <span aria-hidden className="pd-eterm__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="pd-plugin-run__title">
            {t(`${run.provider}Plugin.run.${run.action}`)}
          </span>
        </div>

        {available ? (
          <Suspense fallback={<div className="pd-eterm__view" />}>
            <EmbeddedTerminal
              className="pd-eterm__view"
              exitedLabel={t("terminal.exited")}
              key={run.line}
              onRunningChange={handleRunningChange}
              prefill={run.line}
            />
          </Suspense>
        ) : (
          <div className="pd-eterm__unavailable">{t("terminal.unavailable")}</div>
        )}
      </div>
    </Dialog>
  );
}
