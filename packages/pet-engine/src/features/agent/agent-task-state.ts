export type AgentTaskStatus = "idle" | "working" | "waiting" | "completed" | "failed";

/** Single source of truth for an agent's task lifecycle. Absent = idle. */
export type AgentTaskStateComponent = {
  type: "AgentTaskState";
  status: AgentTaskStatus;
  since: number;
  summary?: string;
};

const FREEZING_STATUSES: ReadonlySet<AgentTaskStatus> = new Set(["waiting", "failed", "completed"]);

/** waiting/failed/completed hold the pet still; working/idle move freely. */
export function statusFreezesMovement(status: AgentTaskStatus): boolean {
  return FREEZING_STATUSES.has(status);
}

/** Overlay badge text; working/idle show no badge. */
export function agentTaskBadgeLabel(status: AgentTaskStatus): "WAIT" | "FAIL" | "DONE" | null {
  switch (status) {
    case "waiting":
      return "WAIT";
    case "failed":
      return "FAIL";
    case "completed":
      return "DONE";
    default:
      return null;
  }
}
