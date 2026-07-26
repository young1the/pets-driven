import type { AgentActivity } from "./agent-event";

/**
 * Claude Code's built-in tools, which report an exact, stable name. Matched
 * first because a built-in name is authoritative in a way a word scan is not:
 * `TodoWrite` manages a checklist, so it is study, not the edit its trailing
 * word suggests.
 */
const KNOWN_TOOLS: Record<string, AgentActivity> = {
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

const STUDY_WORDS = new Set([
  "read",
  "search",
  "find",
  "list",
  "get",
  "fetch",
  "view",
  "review",
  "inspect",
  "query",
]);
const EDIT_WORDS = new Set([
  "write",
  "edit",
  "create",
  "update",
  "delete",
  "patch",
  "replace",
  "rename",
]);
const RUN_WORDS = new Set(["bash", "shell", "exec", "run", "test", "build", "terminal", "deploy"]);

/**
 * Split a tool name into lowercase words.
 *
 * Case is the only separator a built-in name has, so it must be read *before*
 * lowercasing: `toLowerCase()` first collapses `WebSearch` into one opaque
 * token that matches nothing. Handles CamelCase, snake_case, kebab-case, and
 * acronym runs (`MCPServer` → mcp, server).
 */
function toolWords(toolName: string): string[] {
  const matches = toolName.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [];
  return matches.map((word) => word.toLowerCase());
}

/**
 * MCP tools arrive as `mcp__<server>__<tool>`; only the last segment names the
 * operation. The server name must be dropped rather than scanned — a server
 * called `test` or `build` would otherwise make every one of its tools read as
 * a shell command.
 */
function operationSegment(toolName: string): string {
  const segments = toolName.split("__");
  return segments[segments.length - 1] || toolName;
}

/**
 * Convert a provider tool name into the small activity vocabulary understood
 * by Pets-Driven. Exact built-in names win, then the leading word — so names
 * such as `create_thread` remain edit activity even when a later noun resembles
 * a study tool — and only then the remaining words.
 *
 * `undefined` is a first-class answer: a hook that names no tool, or one whose
 * name says nothing, leaves the pet to its own personality.
 */
export function classifyToolActivity(toolName: string | undefined): AgentActivity | undefined {
  if (!toolName?.trim()) return undefined;

  const operation = operationSegment(toolName.trim());
  const known = KNOWN_TOOLS[operation.toLowerCase().replace(/[^a-z0-9]/g, "")];
  if (known) return known;

  const words = toolWords(operation);
  const leading = words[0];
  if (!leading) return undefined;
  if (EDIT_WORDS.has(leading)) return "edit";
  if (RUN_WORDS.has(leading)) return "run";
  if (STUDY_WORDS.has(leading)) return "study";

  if (words.some((word) => RUN_WORDS.has(word))) return "run";
  if (words.some((word) => EDIT_WORDS.has(word))) return "edit";
  if (words.some((word) => STUDY_WORDS.has(word))) return "study";
  return undefined;
}
