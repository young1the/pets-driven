import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainWindow } from "@/app/main-window/main-window";

const home = {
  atHome: [],
  inField: [],
  onDeploy: vi.fn(),
  onRecall: vi.fn(),
  onEdit: vi.fn(),
  onAddPet: vi.fn(),
  onShowAll: vi.fn(),
  onHideAll: vi.fn(),
  onDropItem: vi.fn(),
};
const edit = {
  onName: vi.fn(),
  onNote: vi.fn(),
  onPersonalityId: vi.fn(),
  onAgentProvider: vi.fn(),
  onSwapRunningDirections: vi.fn(),
  onPickFolder: vi.fn(),
  onOpenFolder: vi.fn(),
  onClearFolder: vi.fn(),
  onDelete: vi.fn(),
  onDone: vi.fn(),
};
const settings = {
  appUpdate: {
    currentVersion: "1.0.0",
    status: "idle" as const,
    availableUpdate: null,
    downloadedBytes: 0,
    totalBytes: null,
    error: null,
    check: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
  },
  command: "claude",
  onCommand: vi.fn(),
  terminalShell: "",
  onTerminalShell: vi.fn(),
  confirmRun: true,
  onToggleConfirm: vi.fn(),
  preview: { cwd: "~/core", prompt: "$", command: "claude" },
  hook: {
    tone: "success" as const,
    summary: "ok",
    lastSignal: "Last signal: nothing has arrived yet",
    endpoint: "http://127.0.0.1:43187/claude-hook",
    error: null,
    activity: [],
    rejectedCount: 0,
    onSendTest: vi.fn(),
  },
  plugins: [
    {
      provider: "claude" as const,
      status: { state: "not-installed" as const, version: null, error: null },
      busy: false,
      run: null,
      onCloseRun: vi.fn(),
      onInstall: vi.fn(),
      onUninstall: vi.fn(),
    },
    {
      provider: "codex" as const,
      status: { state: "cli-missing" as const, version: null, error: null },
      busy: false,
      run: null,
      onCloseRun: vi.fn(),
      onInstall: vi.fn(),
      onUninstall: vi.fn(),
    },
  ],
  terminalAvailable: false,
  petSourceDirectory: null as string | null,
  onChangePetFolder: vi.fn(),
  onOpenPetFolder: vi.fn(),
  onResetPetFolder: vi.fn(),
  onResetAllSettings: vi.fn(),
  onResetPets: vi.fn(),
  overlayMode: "window-per-pet" as const,
  onSetOverlayMode: vi.fn(),
  quietMode: "off" as const,
  onSetQuietMode: vi.fn(),
};
const debug = { groups: [], error: null };
const terminal = {
  available: false,
  pickDirectory: vi.fn().mockResolvedValue(null),
  initialCwd: null as string | null,
};

function setup(overrides = {}) {
  const props = {
    tab: "home" as const,
    onTab: vi.fn(),
    editPet: null,
    home,
    edit,
    settings,
    terminal,
    debug,
    toast: null,
    ...overrides,
  };
  const { rerender } = render(<MainWindow {...props} />);
  return {
    props,
    /** Re-render the same window on another tab, the way the host would. */
    goToTab: (tab: string) => rerender(<MainWindow {...props} tab={tab as typeof props.tab} />),
  };
}

describe("MainWindow", () => {
  it("shows the home greeting by default", () => {
    setup();
    // The greeting line itself is time-of-day based and randomized, so assert
    // on the stable trailing name that always renders alongside it.
    expect(screen.getByText("Trainer!", { exact: false })).toBeInTheDocument();
  });

  it("switches tab via the nav", () => {
    const onTab = vi.fn();
    setup({ onTab });
    fireEvent.click(screen.getByText("Settings"));
    expect(onTab).toHaveBeenCalledWith("settings");
  });

  it("shows the edit screen when a pet is being edited", () => {
    setup({
      editPet: {
        id: "otto",
        name: "Otto",
        assetId: "bloop",
        role: "Steady",
        status: {
          label: "Idle",
          labelKey: "idle",
          tone: "neutral",
          dotColor: "var(--ink-300)",
        },
        gradient: { from: "#8B7FE8", to: "#6F5FD6" },
        folder: "core",
        note: "",
      },
    });
    expect(screen.getByDisplayValue("Otto")).toBeInTheDocument();
  });

  it("coaches the pets-driven skills on the terminal tab", () => {
    // The terminal tab is the one surface that opts into the coach; every other
    // reuse of TerminalSection leaves it off.
    setup({ tab: "terminal" as const });
    expect(screen.getByText("Hatch a pet")).toBeInTheDocument();
  });

  it("leaves the terminal unmounted until the tab is first opened", () => {
    setup();

    expect(document.querySelector(".pd-eterm")).toBeNull();
  });

  it("keeps the terminal mounted across a tab switch, so the PTY survives", () => {
    const { goToTab } = setup({ tab: "terminal" as const });
    const section = document.querySelector(".pd-eterm");
    expect(section).not.toBeNull();

    goToTab("home");

    // The very same element, not a fresh one: remounting it would tear down the
    // session and hand the user a new shell every time they came back.
    expect(document.querySelector(".pd-eterm")).toBe(section);
    expect(section?.parentElement?.style.display).toBe("none");

    goToTab("terminal");

    expect(document.querySelector(".pd-eterm")).toBe(section);
    expect(section?.parentElement?.style.display).toBe("contents");
  });

  it("renders a toast when present", () => {
    setup({ toast: "Otto is on the desktop" });
    expect(screen.getByText("Otto is on the desktop")).toBeInTheDocument();
  });
});
