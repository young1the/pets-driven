import type { DesktopGateway } from "@/app/desktop-gateway";
import { useAgentPlugin } from "@/app/use-agent-plugin";

/** Compatibility wrapper for call sites that only need the Claude provider. */
export function useClaudePlugin(gateway: DesktopGateway) {
  return useAgentPlugin(gateway, "claude");
}
