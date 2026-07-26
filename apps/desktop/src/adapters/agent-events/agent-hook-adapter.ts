import type { AgentEvent } from "./agent-event";
import type { AgentHookIngressEvent, AgentHookProvider } from "./agent-hook-ingress";
import { CLAUDE_HOOK_ADAPTER, type ClaudeHookAdapterOptions } from "./claude-hook-adapter";
import { CODEX_HOOK_ADAPTER, type CodexHookAdapterOptions } from "./codex-hook-adapter";

export type AgentHookAdapterOptions = ClaudeHookAdapterOptions & CodexHookAdapterOptions;

/**
 * Provider boundary for hook payloads. Every provider owns its raw contract
 * and translates it into the stable AgentEvent interface used by the app.
 */
export interface AgentHookAdapter {
  readonly provider: AgentHookProvider;
  toAgentEvent(payload: unknown, options?: AgentHookAdapterOptions): AgentEvent;
}

const ADAPTERS: Record<AgentHookProvider, AgentHookAdapter> = {
  claude: CLAUDE_HOOK_ADAPTER,
  codex: CODEX_HOOK_ADAPTER,
};

export function createAgentEventFromHook(
  event: AgentHookIngressEvent,
  options: AgentHookAdapterOptions = {},
): AgentEvent {
  return ADAPTERS[event.provider].toAgentEvent(event.payload, options);
}
