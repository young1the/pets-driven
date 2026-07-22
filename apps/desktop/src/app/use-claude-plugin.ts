import { useCallback, useEffect, useRef, useState } from "react";
import type { ClaudePluginAction, ClaudePluginStatus, DesktopGateway } from "@/app/desktop-gateway";

/** How often the card re-reads the CLI while the install terminal is open. */
const STATUS_POLL_MS = 1500;

/** A prepared install/uninstall the in-app terminal is showing. */
export type ClaudePluginRun = {
  action: ClaudePluginAction;
  /** The `claude` line typed into the shell. */
  line: string;
};

/**
 * Install state of the bundled Claude Code plugin, shared by the onboarding
 * plugin step and the settings agent-connection card. Status is `null` while
 * the first check is in flight.
 *
 * Install and uninstall do not run here: they are handed to the in-app terminal
 * so the user can watch, answer prompts, and keep poking afterwards. Because
 * the user is free to do anything in that shell — retry, uninstall by hand, log
 * in — completion is never inferred from a command exiting. The status is just
 * polled while the terminal is open, so the card reflects whatever actually
 * happened.
 */
export function useClaudePlugin(gateway: DesktopGateway) {
  const [status, setStatus] = useState<ClaudePluginStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<ClaudePluginRun | null>(null);
  const gatewayRef = useRef(gateway);
  gatewayRef.current = gateway;

  const refresh = useCallback(async () => {
    try {
      setStatus(await gatewayRef.current.getClaudePluginStatus());
    } catch (error) {
      setStatus({
        state: "error",
        version: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep the card honest while the terminal is open, whatever the user runs.
  useEffect(() => {
    if (!run) {
      return;
    }

    const intervalId = window.setInterval(() => void refresh(), STATUS_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [run, refresh]);

  const start = useCallback(async (action: ClaudePluginAction) => {
    setBusy(true);
    try {
      const plan = await gatewayRef.current.planClaudePluginCommand(action);
      setStatus(plan.status);
      setRun(plan.line ? { action, line: plan.line } : null);
    } catch (error) {
      setStatus({
        state: "error",
        version: null,
        error: error instanceof Error ? error.message : String(error),
      });
      setRun(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(() => void start("install"), [start]);
  const uninstall = useCallback(() => void start("uninstall"), [start]);
  const dismissRun = useCallback(() => {
    setRun(null);
    void refresh();
  }, [refresh]);

  return { status, busy, run, install, uninstall, dismissRun };
}
