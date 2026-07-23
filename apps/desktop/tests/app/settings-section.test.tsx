import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsSection } from "@/app/main-window/settings-section";

function setup(overrides = {}) {
  const props = {
    command: "claude --resume",
    onCommand: vi.fn(),
    terminalShell: "",
    onTerminalShell: vi.fn(),
    preview: {
      cwd: "C:\\pets\\core",
      prompt: "C:\\>",
      command: "cmd /k claude --resume",
    },
    hook: {
      tone: "success" as const,
      summary: "your pets are following along.",
      lastSignal: "Last signal: nothing has arrived yet",
    },
    plugin: {
      state: "not-installed" as const,
      version: null,
      error: null,
    },
    pluginBusy: false,
    pluginRun: null,
    terminalAvailable: false,
    onClosePluginRun: vi.fn(),
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

  it("picks the terminal shell that backs both the app terminal and the launch line", () => {
    const onTerminalShell = vi.fn();
    setup({ onTerminalShell, terminalShell: "C:\\Windows\\System32\\cmd.exe" });

    fireEvent.change(screen.getByLabelText("Terminal"), { target: { value: "" } });

    expect(onTerminalShell).toHaveBeenCalledWith("");
  });

  it("states the connection as one line, with no ingress URL or test action", () => {
    setup({ plugin: { state: "installed" as const, version: "0.1.0", error: null } });

    expect(
      screen.getByText("Installed · v0.1.0 — your pets are following along."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Send test event")).not.toBeInTheDocument();
    expect(screen.queryByText(/127\.0\.0\.1/)).not.toBeInTheDocument();
  });

  it("shows the last hook signal on the connection card, whatever the plugin state", () => {
    // This line is the only hook-traffic read-out a release build has: the
    // debug tab is stripped by the DEV gate in main-window.tsx, so it has to
    // read on the settings card even before the plugin is installed.
    setup({ hook: { tone: "info" as const, summary: "", lastSignal: "Last signal: PreToolUse" } });

    expect(screen.getByText("Last signal: PreToolUse")).toBeInTheDocument();
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

    expect(
      screen.getByText("Installed · v0.1.0 — your pets are following along."),
    ).toBeInTheDocument();

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
