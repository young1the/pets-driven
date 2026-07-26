import type { WorkingFocusReason } from "@pets-driven/pet-engine/pets/personalities/working-styles";

/**
 * The kind of work a tool call represents, as far as a pet can act it out.
 *
 * Deliberately coarse. Agents differ in what they report — Claude names the
 * tool, Codex only says "a tool ran" — and the pet is a companion, not a log
 * viewer. Three families is the most a pet can express with its body, and any
 * tool it cannot place simply leaves the pet to its own personality.
 */
export type AgentToolFamily = "study" | "edit" | "run";

/** The working pose each family plays. See pose-choreography.ts for the rhythms. */
const FAMILY_POSE: Record<AgentToolFamily, WorkingFocusReason> = {
  // Reading and searching: the pet looks things over between passes.
  study: "working-ponder",
  // Changing files: absorbed fiddling with the result.
  edit: "working-tinker",
  // Commands and tests: a heads-down burst while the thing runs.
  run: "working-focus",
};

/** Claude Code's built-in tools, which report an exact, stable name. */
const KNOWN_TOOLS: Record<string, AgentToolFamily> = {
  read: "study",
  grep: "study",
  glob: "study",
  websearch: "study",
  webfetch: "study",
  notebookread: "study",
  todoread: "study",
  todowrite: "study",
  task: "study",
  exitplanmode: "study",
  edit: "edit",
  multiedit: "edit",
  write: "edit",
  notebookedit: "edit",
  bash: "run",
  bashoutput: "run",
  killbash: "run",
  killshell: "run",
};

/**
 * Verb fragments for tools outside the built-in set — MCP servers name theirs
 * freely (`mcp__github__create_pull_request`). Order matters: the first
 * fragment found in the name wins, so the more specific verbs come first.
 */
const NAME_FRAGMENTS: ReadonlyArray<[string, AgentToolFamily]> = [
  ["search", "study"],
  ["read", "study"],
  ["list", "study"],
  ["get", "study"],
  ["fetch", "study"],
  ["view", "study"],
  ["inspect", "study"],
  ["write", "edit"],
  ["edit", "edit"],
  ["create", "edit"],
  ["update", "edit"],
  ["patch", "edit"],
  ["delete", "edit"],
  ["rename", "edit"],
  ["run", "run"],
  ["exec", "run"],
  ["shell", "run"],
  ["command", "run"],
  ["test", "run"],
  ["build", "run"],
  ["deploy", "run"],
];

/**
 * The family a reported tool name belongs to, or `null` when the pet cannot
 * tell — an unnamed tool (every Codex hook) or one whose name says nothing.
 * `null` is a first-class answer, not a failure: the pet falls back to its own
 * personality's working pose, which is what an agent that reports less detail
 * should look like.
 */
export function agentToolFamily(toolName: string | undefined | null): AgentToolFamily | null {
  const normalized = toolName?.trim().toLowerCase();
  if (!normalized) return null;

  // MCP tools arrive as `mcp__<server>__<tool>`; only the last segment names
  // the operation, and a server name like "filesystem" would mislead the
  // fragment scan below.
  const operation = normalized.split("__").pop() ?? normalized;

  const known = KNOWN_TOOLS[operation.replace(/[^a-z]/g, "")];
  if (known) return known;

  for (const [fragment, family] of NAME_FRAGMENTS) {
    if (operation.includes(fragment)) return family;
  }

  return null;
}

/** The working pose a tool family acts out. */
export function workingPoseForToolFamily(family: AgentToolFamily): WorkingFocusReason {
  return FAMILY_POSE[family];
}
