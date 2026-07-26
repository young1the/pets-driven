import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentPluginAction,
  AgentPluginProvider,
  AgentPluginStatus,
  DesktopGateway,
} from "@/app/desktop-gateway";

const STATUS_POLL_MS = 1500;

export type AgentPluginRun = {
  provider: AgentPluginProvider;
  action: AgentPluginAction;
  line: string;
};

function providerGateway(gateway: DesktopGateway, provider: AgentPluginProvider) {
  if (provider === "codex") {
    return {
      status: () => gateway.getCodexPluginStatus(),
      plan: (action: AgentPluginAction) => gateway.planCodexPluginCommand(action),
    };
  }

  return {
    status: () => gateway.getClaudePluginStatus(),
    plan: (action: AgentPluginAction) => gateway.planClaudePluginCommand(action),
  };
}

/**
 * Install state and visible terminal run for one Agent Source plugin.
 *
 * The provider CLI remains the owner of its marketplace and install state. The
 * app prepares a command, shows it in a real terminal, and polls the provider
 * while that terminal stays open.
 */
export function useAgentPlugin(gateway: DesktopGateway, provider: AgentPluginProvider) {
  const [status, setStatus] = useState<AgentPluginStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<AgentPluginRun | null>(null);
  const gatewayRef = useRef(gateway);
  gatewayRef.current = gateway;

  const refresh = useCallback(async () => {
    try {
      setStatus(await providerGateway(gatewayRef.current, provider).status());
    } catch (error) {
      setStatus({
        state: "error",
        version: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!run) {
      return;
    }

    const intervalId = window.setInterval(() => void refresh(), STATUS_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [run, refresh]);

  const start = useCallback(
    async (action: AgentPluginAction) => {
      setBusy(true);
      try {
        const plan = await providerGateway(gatewayRef.current, provider).plan(action);
        setStatus(plan.status);
        setRun(plan.line ? { provider, action, line: plan.line } : null);
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
    },
    [provider],
  );

  const install = useCallback(() => void start("install"), [start]);
  const uninstall = useCallback(() => void start("uninstall"), [start]);
  const dismissRun = useCallback(() => {
    setRun(null);
    void refresh();
  }, [refresh]);

  return { provider, status, busy, run, install, uninstall, dismissRun };
}
