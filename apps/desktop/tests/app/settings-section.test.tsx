import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsSection } from "@/app/main-window/settings-section";

function setup(overrides = {}) {
  const props = {
    launchProfile: "cmd" as const,
    command: "claude --resume",
    launchLine: "cmd /k claude --resume",
    onLaunchProfile: vi.fn(),
    onCommand: vi.fn(),
    onLaunchLine: vi.fn(),
    terminalShell: "",
    onTerminalShell: vi.fn(),
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
    plugin: {
      state: "not-installed" as const,
      version: null,
      error: null,
    },
    pluginBusy: false,
    onInstallPlugin: vi.fn(),
    onUninstallPlugin: vi.fn(),
    petSourceDirectory: null as string | null,
    defaultPetSourceDirectory: "C:\\Users\\me\\.petdex\\pets",
    onChangePetFolder: vi.fn(),
    onResetPetFolder: vi.fn(),
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
    fireEvent.click(screen.getByText("PowerShell"));
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

  it("shows the hook status and sends a test event", () => {
    const onReconnect = vi.fn();
    setup({ onReconnect });

    expect(screen.getByText("All connected")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Send test event"));
    expect(onReconnect).toHaveBeenCalled();
  });

  it("installs the Claude plugin when not installed", () => {
    const onInstallPlugin = vi.fn();
    setup({ onInstallPlugin });

    fireEvent.click(screen.getByText("Install"));
    expect(onInstallPlugin).toHaveBeenCalled();
  });

  it("offers reinstall and remove when the plugin is installed", () => {
    const onInstallPlugin = vi.fn();
    const onUninstallPlugin = vi.fn();
    setup({
      plugin: { state: "installed" as const, version: "0.1.0", error: null },
      onInstallPlugin,
      onUninstallPlugin,
    });

    expect(screen.getByText("Installed · v0.1.0")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reinstall"));
    expect(onInstallPlugin).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Remove"));
    expect(onUninstallPlugin).toHaveBeenCalled();
  });

  it("hides plugin actions and explains when the CLI is missing", () => {
    setup({
      plugin: { state: "cli-missing" as const, version: null, error: null },
    });

    expect(
      screen.getByText("Claude Code CLI not found. Install Claude Code first, then come back."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Install")).not.toBeInTheDocument();
  });

  it("shows the Petdex default folder when no custom folder is set", () => {
    setup();

    expect(screen.getByText("Petdex default folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\me\\.petdex\\pets")).toBeInTheDocument();
    expect(screen.queryByText("Back to default")).not.toBeInTheDocument();
  });

  it("shows a custom folder and resets it to the default", () => {
    const onResetPetFolder = vi.fn();
    setup({
      petSourceDirectory: "D:\\pets\\mine",
      onResetPetFolder,
    });

    expect(screen.getByText("D:\\pets\\mine")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back to default"));
    expect(onResetPetFolder).toHaveBeenCalled();
  });

  it("changes the pet source folder", () => {
    const onChangePetFolder = vi.fn();
    setup({ onChangePetFolder });

    fireEvent.click(screen.getByText("Use a different folder"));
    expect(onChangePetFolder).toHaveBeenCalled();
  });
});
