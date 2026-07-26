export const AGENT_HOOK_INGRESS_EVENT = "agent-hook:received:v1";

export type AgentHookProvider = "claude" | "codex";

export type AgentHookIngressEvent = {
  provider: AgentHookProvider;
  payload: unknown;
};

export function isAgentHookIngressEvent(value: unknown): value is AgentHookIngressEvent {
  if (!value || typeof value !== "object") return false;
  const provider = (value as { provider?: unknown }).provider;
  return (
    (provider === "claude" || provider === "codex") && Object.hasOwn(value as object, "payload")
  );
}

/**
 * Mirrors the shared hook ingress status in the Tauri backend.
 * The backend command retains its legacy name for compatibility.
 */
export type AgentHookIngressStatus = {
  url: string;
  state: "pending" | "listening" | "error";
  error: string | null;
  lastEventAt: number | null;
  receivedCount: number;
  rejectedCount: number;
  lastEventName: string | null;
  recent: AgentHookIngressActivity[];
};

export type AgentHookIngressActivity = {
  at: number;
  label: string;
  accepted: boolean;
};
