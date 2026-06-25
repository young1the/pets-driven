import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsSection } from "@/app/main-window/settings-section";

function setup(overrides = {}) {
  const props = {
    shell: "bash",
    command: "claude --resume",
    onShell: vi.fn(),
    onCommand: vi.fn(),
    confirmRun: true,
    onToggleConfirm: vi.fn(),
    preview: { cwd: "~/core", prompt: "$", command: "claude --resume" },
    hook: {
      tone: "success" as const,
      label: "All connected",
      summary: "6 of 6 agents reporting",
      url: "claude-hook://127.0.0.1:7878",
    },
    onReconnect: vi.fn(),
    ...overrides,
  };
  render(<SettingsSection {...props} />);
  return props;
}

describe("SettingsSection", () => {
  it("edits the command", () => {
    const onCommand = vi.fn();
    setup({ onCommand });
    fireEvent.change(screen.getByDisplayValue("claude --resume"), {
      target: { value: "claude" },
    });
    expect(onCommand).toHaveBeenCalledWith("claude");
  });

  it("switches the shell", () => {
    const onShell = vi.fn();
    setup({ onShell });
    fireEvent.click(screen.getByText("cmd"));
    expect(onShell).toHaveBeenCalledWith("cmd");
  });

  it("shows the hook status label", () => {
    setup();
    expect(screen.getByText("All connected")).toBeInTheDocument();
  });
});
