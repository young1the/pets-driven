import type { AgentActivity } from "./agent-event";

const STUDY_WORDS = new Set(["read", "search", "find", "list", "review", "inspect", "query"]);
const EDIT_WORDS = new Set(["write", "edit", "create", "update", "delete", "patch", "replace"]);
const RUN_WORDS = new Set(["bash", "shell", "exec", "run", "test", "build", "terminal"]);

/**
 * Convert a provider tool name into the small activity vocabulary understood
 * by Pets-Driven. Leading verbs win so names such as `create_thread` remain
 * edit activity even when a later noun resembles a study tool.
 */
export function classifyToolActivity(toolName: string | undefined): AgentActivity | undefined {
  const words = toolName?.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length === 0) return undefined;

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
