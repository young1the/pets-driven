import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsSection } from "@/app/main-window/settings-section";

function setup(overrides = {}) {
  const props = {
    launchProfile: "cmd" as const,
    command: "claude --resume",
    launchLine: "cmd /k claude --resume",
    onLaunchProfile: vi.fn(),
    onCommand: vi.fn(),
    onLaunchLine: vi.fn(),
    confirmRun: true,
    onToggleConfirm: vi.fn(),
    preview: {
      cwd: "C:\\pets\\core",
      prompt: "C:\\>",
      command: "cmd /k claude --resume",
    },
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

  it("switches the launch profile", () => {
    const onLaunchProfile = vi.fn();
    setup({ onLaunchProfile });
    fireEvent.change(screen.getByLabelText("Shell"), {
      target: { value: "powershell" },
    });
    expect(onLaunchProfile).toHaveBeenCalledWith("powershell");
  });

  it("edits the raw launch line when custom is selected", () => {
    const onLaunchLine = vi.fn();
    setup({
      launchProfile: "custom",
      launchLine: '"C:\\Tools\\Git\\bin\\bash.exe" -lc "claude; exec bash"',
      onLaunchLine,
      preview: {
        cwd: "C:\\pets\\core",
        prompt: ">",
        command: '"C:\\Tools\\Git\\bin\\bash.exe" -lc "claude; exec bash"',
      },
    });

    fireEvent.change(screen.getByLabelText("Launch line"), {
      target: { value: "wt -d . powershell" },
    });

    expect(onLaunchLine).toHaveBeenCalledWith("wt -d . powershell");
  });

  it("toggles confirmation when clicking the setting text", () => {
    const onToggleConfirm = vi.fn();
    setup({ onToggleConfirm });

    fireEvent.click(screen.getByText("Ask before running"));

    expect(onToggleConfirm).toHaveBeenCalledOnce();
  });

  it("does not show the Claude hook card", () => {
    setup();
    expect(screen.queryByText("Claude agent hook")).not.toBeInTheDocument();
    expect(screen.queryByText("All connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Reconnect")).not.toBeInTheDocument();
  });
});
