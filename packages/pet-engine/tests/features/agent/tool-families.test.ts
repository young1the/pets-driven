import {
  agentToolFamily,
  workingPoseForToolFamily,
} from "@pets-driven/pet-engine/features/agent/tool-families";
import { describe, expect, it } from "vitest";

describe("agentToolFamily", () => {
  it.each([
    ["Read", "study"],
    ["Grep", "study"],
    ["WebSearch", "study"],
    ["Task", "study"],
    ["Edit", "edit"],
    ["Write", "edit"],
    ["NotebookEdit", "edit"],
    ["Bash", "run"],
    ["BashOutput", "run"],
  ] as const)("places the built-in %s tool", (tool, family) => {
    expect(agentToolFamily(tool)).toBe(family);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(agentToolFamily("  bash  ")).toBe("run");
  });

  /** MCP servers name their tools freely, so the operation verb has to carry it. */
  it.each([
    ["mcp__github__search_issues", "study"],
    ["mcp__github__create_pull_request", "edit"],
    ["mcp__ci__run_workflow", "run"],
  ] as const)("reads the operation out of the MCP tool %s", (tool, family) => {
    expect(agentToolFamily(tool)).toBe(family);
  });

  /**
   * Only the last segment names the operation: a server called "filesystem" or
   * "readonly-db" must not decide the family for the tool it hosts.
   */
  it("ignores the MCP server name", () => {
    expect(agentToolFamily("mcp__readonly__deploy_service")).toBe("run");
  });

  /**
   * An unplaceable tool is a supported answer, not a failure — every Codex hook
   * arrives without a tool name at all.
   */
  it.each([undefined, null, "", "   ", "Sparkle"])("cannot place %s", (tool) => {
    expect(agentToolFamily(tool)).toBeNull();
  });
});

describe("workingPoseForToolFamily", () => {
  it("gives each family a distinct working pose", () => {
    const poses = (["study", "edit", "run"] as const).map(workingPoseForToolFamily);
    expect(poses).toEqual(["working-ponder", "working-tinker", "working-focus"]);
    expect(new Set(poses).size).toBe(3);
  });
});
