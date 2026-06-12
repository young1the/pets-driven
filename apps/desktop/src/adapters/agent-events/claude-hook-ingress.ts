export const CLAUDE_HOOK_INGRESS_EVENT = "claude-hook:received:v1";

export type ClaudeHookIngressStatus = {
  url: string;
  state: "pending" | "listening" | "error";
  error: string | null;
};
