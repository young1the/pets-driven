import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type SettingsCategory, SettingsSection } from "@/app/main-window/settings-section";

function plugin(
  provider: "claude" | "codex",
  state: "cli-missing" | "not-installed" | "installed" | "error",
  version: string | null = null,
) {
  return {
    provider,
    status: { state, version, error: null },
    busy: false,
    run: null,
    onCloseRun: vi.fn(),
    onInstall: vi.fn(),
    onUninstall: vi.fn(),
  };
}

function setupProps(overrides = {}) {
  return {
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
      endpoint: "http://127.0.0.1:43187/claude-hook",
      error: null as string | null,
      activity: [] as { at: number; label: string; accepted: boolean }[],
      rejectedCount: 0,
      onSendTest: vi.fn().mockResolvedValue("HTTP/1.1 200 OK"),
    },
    plugins: [plugin("claude", "not-installed"), plugin("codex", "cli-missing")],
    terminalAvailable: false,
    petSourceDirectory: null as string | null,
    onChangePetFolder: vi.fn(),
    onOpenPetFolder: vi.fn(),
    onResetPetFolder: vi.fn(),
    onResetAllSettings: vi.fn(),
    onResetPets: vi.fn(),
    overlayMode: "window-per-pet" as const,
    onSetOverlayMode: vi.fn(),
    ...overrides,
  };
}

/** The rail labels, keyed the same way `SettingsSection` orders its categories. */
const RAIL_LABEL: Record<SettingsCategory, string> = {
  terminal: "Terminal",
  agent: "Agent",
  pets: "Pets",
  appearance: "Appearance",
  reset: "Reset",
};

/** Only one panel is mounted at a time, so a test has to open its category. */
function openCategory(category: SettingsCategory) {
  fireEvent.click(screen.getByRole("button", { name: RAIL_LABEL[category] }));
}

function setup(category: SettingsCategory, overrides = {}) {
  const props = setupProps(overrides);
  render(<SettingsSection {...props} />);
  openCategory(category);
  return props;
}

describe("SettingsSection rail", () => {
  it("opens on the terminal category and shows only that panel", () => {
    render(<SettingsSection {...setupProps()} />);

    expect(screen.getByLabelText("Terminal")).toBeInTheDocument();
    // The other categories are one click away, not below the fold.
    expect(screen.queryByText("Pets folder")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Reset all settings", { selector: "button" }),
    ).not.toBeInTheDocument();
  });

  it("swaps the panel when another category is picked", () => {
    render(<SettingsSection {...setupProps()} />);

    openCategory("pets");

    expect(screen.getByText("Pets folder")).toBeInTheDocument();
    expect(screen.queryByLabelText("Terminal")).not.toBeInTheDocument();
  });

  it("marks the open category on the rail", () => {
    render(<SettingsSection {...setupProps()} />);

    openCategory("appearance");

    expect(screen.getByRole("button", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "Terminal" })).toHaveAttribute(
      "aria-current",
      "false",
    );
  });
});

describe("SettingsSection terminal", () => {
  it("edits the command", () => {
    const onCommand = vi.fn();
    setup("terminal", { onCommand });
    fireEvent.change(screen.getByDisplayValue("claude --resume"), {
      target: { value: "claude" },
    });
    expect(onCommand).toHaveBeenCalledWith("claude");
  });

  it("picks the terminal shell that backs both the app terminal and the launch line", () => {
    const onTerminalShell = vi.fn();
    setup("terminal", { onTerminalShell, terminalShell: "C:\\Windows\\System32\\cmd.exe" });

    fireEvent.change(screen.getByLabelText("Terminal"), { target: { value: "" } });

    expect(onTerminalShell).toHaveBeenCalledWith("");
  });
});

describe("SettingsSection agent", () => {
  it("states the connection as one line, keeping the endpoint and test action folded away", () => {
    // The card itself stays a sentence. The endpoint and the self-test are a
    // diagnostic for when that sentence is not enough, so they sit inside a
    // collapsed disclosure rather than on the card.
    setup("agent", { plugins: [plugin("claude", "installed", "0.1.0")] });

    expect(
      screen.getByText("Installed · v0.1.0 — your pets are following along."),
    ).toBeInTheDocument();
    expect(screen.getByText("Connection details").closest("details")?.open).toBe(false);
  });

  it("shows the last hook signal on the connection card, whatever the plugin state", () => {
    // This line is the only hook-traffic read-out a release build has: the
    // debug tab is stripped by the DEV gate in main-window.tsx, so it has to
    // read on the settings card even before the plugin is installed.
    setup("agent", {
      hook: {
        tone: "info" as const,
        summary: "",
        lastSignal: "Last signal: PreToolUse",
        endpoint: "http://127.0.0.1:43187/claude-hook",
        error: null,
        activity: [],
        rejectedCount: 0,
        onSendTest: vi.fn(),
      },
    });

    expect(screen.getByText("Last signal: PreToolUse")).toBeInTheDocument();
  });

  it("installs the Claude plugin when not installed", () => {
    const claude = plugin("claude", "not-installed");
    setup("agent", { plugins: [claude] });

    fireEvent.click(screen.getByText("Install"));
    expect(claude.onInstall).toHaveBeenCalled();
  });

  it("offers reinstall and remove when the plugin is installed", () => {
    const claude = plugin("claude", "installed", "0.1.0");
    setup("agent", { plugins: [claude] });

    expect(
      screen.getByText("Installed · v0.1.0 — your pets are following along."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reinstall"));
    expect(claude.onInstall).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Remove"));
    expect(claude.onUninstall).toHaveBeenCalled();
  });

  it("hides plugin actions and explains when the CLI is missing", () => {
    setup("agent", { plugins: [plugin("claude", "cli-missing")] });

    expect(
      screen.getByText("Claude Code CLI not found. Install Claude Code first, then come back."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Install")).not.toBeInTheDocument();
  });

  it("installs Codex and explains the one-time hook trust step", () => {
    const codex = plugin("codex", "not-installed");
    const { rerender } = render(<SettingsSection {...setupProps({ plugins: [codex] })} />);
    openCategory("agent");

    fireEvent.click(screen.getByText("Install"));
    expect(codex.onInstall).toHaveBeenCalled();

    const installed = {
      ...codex,
      status: { state: "installed" as const, version: "0.1.0", error: null },
    };
    rerender(<SettingsSection {...setupProps({ plugins: [installed] })} />);
    expect(
      screen.getByText("In a new Codex thread, open /hooks and trust the pets-driven hooks."),
    ).toBeInTheDocument();
  });
});

describe("SettingsSection pets", () => {
  it("reads as no folder set, with no folder actions, when none is designated", () => {
    setup("pets");

    expect(screen.getByText("No folder set")).toBeInTheDocument();
    // Nothing to open or clear until the user actually designates a folder.
    expect(screen.queryByText("Open in Explorer")).not.toBeInTheDocument();
    expect(screen.queryByText("Clear folder")).not.toBeInTheDocument();
  });

  it("shows a custom folder and clears it", () => {
    const onResetPetFolder = vi.fn();
    setup("pets", {
      petSourceDirectory: "D:\\pets\\mine",
      onResetPetFolder,
    });

    expect(screen.getByText("D:\\pets\\mine")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Clear folder"));
    expect(onResetPetFolder).toHaveBeenCalled();
  });

  it("changes the pet source folder", () => {
    const onChangePetFolder = vi.fn();
    setup("pets", { onChangePetFolder });

    fireEvent.click(screen.getByText("Use a different folder"));
    expect(onChangePetFolder).toHaveBeenCalled();
  });

  it("opens the designated pet source folder in Explorer", () => {
    const onOpenPetFolder = vi.fn();
    setup("pets", { petSourceDirectory: "D:\\pets\\mine", onOpenPetFolder });

    fireEvent.click(screen.getByText("Open in Explorer"));
    expect(onOpenPetFolder).toHaveBeenCalled();
  });

  it("switches how the pets are put on the desktop", () => {
    const onSetOverlayMode = vi.fn();
    setup("pets", { onSetOverlayMode });

    fireEvent.click(screen.getByText("One shared window"));
    expect(onSetOverlayMode).toHaveBeenCalledWith("single-window");
  });
});

describe("SettingsSection reset", () => {
  it("asks before resetting anything", () => {
    const onResetAllSettings = vi.fn();
    setup("reset", { onResetAllSettings });

    // Pressing the action only opens the confirm; nothing is reset yet. A
    // destructive action one stray click away is the bug this guards.
    fireEvent.click(screen.getByText("Reset all settings", { selector: "button" }));

    expect(screen.getByText("Reset every setting?")).toBeInTheDocument();
    expect(onResetAllSettings).not.toHaveBeenCalled();
  });

  it("resets once the second step is confirmed", () => {
    const onResetAllSettings = vi.fn();
    setup("reset", { onResetAllSettings });

    fireEvent.click(screen.getByText("Reset all settings", { selector: "button" }));
    fireEvent.click(screen.getByText("Yes, reset settings"));

    expect(onResetAllSettings).toHaveBeenCalledTimes(1);
    // The confirm closes again, so a second reset needs both steps again.
    expect(screen.queryByText("Reset every setting?")).not.toBeInTheDocument();
  });

  it("backs out of the confirm without resetting", () => {
    const onResetAllSettings = vi.fn();
    setup("reset", { onResetAllSettings });

    fireEvent.click(screen.getByText("Reset all settings", { selector: "button" }));
    fireEvent.click(screen.getByText("Keep my settings"));

    expect(onResetAllSettings).not.toHaveBeenCalled();
    expect(screen.queryByText("Reset every setting?")).not.toBeInTheDocument();
  });

  it("leaves the pets out of the reset", () => {
    // Settings only: the section says so, and it has no pet-touching callback
    // to reach for. The state-level guarantee is pinned by `resetSettings` in
    // tests/app-state/pets-driven-state.test.ts and by the Rust unit tests on
    // apply_settings_reset.
    const props = setup("reset");

    fireEvent.click(screen.getByText("Reset all settings", { selector: "button" }));
    expect(screen.getByText(/Your pets, their folders and their looks are not touched\./));

    fireEvent.click(screen.getByText("Yes, reset settings"));

    expect(props.onChangePetFolder).not.toHaveBeenCalled();
    expect(props.onResetPetFolder).not.toHaveBeenCalled();
    expect(props.onCommand).not.toHaveBeenCalled();
  });
});

describe("SettingsSection reset pets", () => {
  it("asks before removing any pet", () => {
    const onResetPets = vi.fn();
    setup("reset", { onResetPets });

    // Same guard as the settings reset: the first click only opens the confirm.
    fireEvent.click(screen.getByText("Reset all pets", { selector: "button" }));

    expect(screen.getByText("Remove every pet?")).toBeInTheDocument();
    expect(onResetPets).not.toHaveBeenCalled();
  });

  it("removes the pets once the second step is confirmed", () => {
    const onResetPets = vi.fn();
    setup("reset", { onResetPets });

    fireEvent.click(screen.getByText("Reset all pets", { selector: "button" }));
    fireEvent.click(screen.getByText("Yes, remove every pet"));

    expect(onResetPets).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Remove every pet?")).not.toBeInTheDocument();
  });

  it("backs out of the confirm without removing anything", () => {
    const onResetPets = vi.fn();
    setup("reset", { onResetPets });

    fireEvent.click(screen.getByText("Reset all pets", { selector: "button" }));
    fireEvent.click(screen.getByText("Keep my pets"));

    expect(onResetPets).not.toHaveBeenCalled();
    expect(screen.queryByText("Remove every pet?")).not.toBeInTheDocument();
  });

  it("arms only one reset at a time", () => {
    // The two actions share one row: arming the settings reset replaces the
    // whole button group with its confirm, so the pets action isn't even on
    // screen to be clicked by mistake. Cancelling brings both buttons back.
    setup("reset");

    fireEvent.click(screen.getByText("Reset all settings", { selector: "button" }));
    expect(screen.getByText("Reset every setting?")).toBeInTheDocument();
    expect(screen.queryByText("Reset all pets", { selector: "button" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Keep my settings"));
    fireEvent.click(screen.getByText("Reset all pets", { selector: "button" }));
    expect(screen.getByText("Remove every pet?")).toBeInTheDocument();
    expect(
      screen.queryByText("Reset all settings", { selector: "button" }),
    ).not.toBeInTheDocument();
  });
});

const REVIEW_HINT =
  "The command is typed in below, not run yet. Read it over, then press Enter in the terminal to run it.";

function running(provider: "claude" | "codex") {
  return {
    ...plugin(provider, "not-installed"),
    run: { provider, action: "install" as const, line: `${provider}-install-line` },
  };
}

describe("SettingsSection plugin run", () => {
  it("opens the run in a modal rather than inline under the cards", () => {
    setup("agent", { plugins: [running("claude"), plugin("codex", "cli-missing")] });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Claude Code plugin");
    expect(dialog).toHaveTextContent(REVIEW_HINT);
  });

  it("shows one run at a time, even with a run on both providers", () => {
    // Two terminals used to render side by side, each prefilled and each
    // grabbing focus on mount — so Enter could run the command the user was
    // not reading. A modal is one at a time by construction.
    setup("agent", { plugins: [running("claude"), running("codex")] });

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("leaves Escape to whatever is running in the shell", () => {
    const claude = running("claude");
    setup("agent", { plugins: [claude] });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(claude.onCloseRun).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes only when the user says so", () => {
    const claude = running("claude");
    setup("agent", { plugins: [claude] });

    fireEvent.click(screen.getByText("Close"));

    expect(claude.onCloseRun).toHaveBeenCalled();
  });
});
