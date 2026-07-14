import { useCallback, useEffect, useState } from "react";
import type { ClaudePluginStatus, DesktopGateway } from "@/app/desktop-gateway";

/**
 * Install state of the bundled Claude Code plugin, shared by the onboarding
 * "done" step and the settings agent-connection card. Status is `null` while
 * the first check is in flight.
 */
export function useClaudePlugin(gateway: DesktopGateway) {
  const [status, setStatus] = useState<ClaudePluginStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<ClaudePluginStatus>) => {
    setBusy(true);
    try {
      setStatus(await action());
    } catch (error) {
      setStatus({
        state: "error",
        version: null,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(() => gateway.getClaudePluginStatus());
  }, [gateway, run]);

  const install = useCallback(() => run(() => gateway.installClaudePlugin()), [gateway, run]);
  const uninstall = useCallback(() => run(() => gateway.uninstallClaudePlugin()), [gateway, run]);

  return { status, busy, install, uninstall };
}
