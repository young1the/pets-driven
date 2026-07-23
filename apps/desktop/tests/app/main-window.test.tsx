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
};
const edit = {
  onName: vi.fn(),
  onMemo: vi.fn(),
  onPersonalityId: vi.fn(),
  onPickFolder: vi.fn(),
  onClearFolder: vi.fn(),
  onToggleDeployed: vi.fn(),
  onDelete: vi.fn(),
  onDone: vi.fn(),
};
const settings = {
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
  },
  plugin: { state: "not-installed" as const, version: null, error: null },
  pluginBusy: false,
  pluginRun: null,
  terminalAvailable: false,
  onClosePluginRun: vi.fn(),
  onInstallPlugin: vi.fn(),
  onUninstallPlugin: vi.fn(),
  petSourceDirectory: null as string | null,
  defaultPetSourceDirectory: null as string | null,
  onChangePetFolder: vi.fn(),
  onResetPetFolder: vi.fn(),
  onResetAllSettings: vi.fn(),
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
  render(<MainWindow {...props} />);
  return props;
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
        memo: "",
        deployed: false,
      },
    });
    expect(screen.getByText("Pet details")).toBeInTheDocument();
  });

  it("coaches the pets-driven skills on the terminal tab", () => {
    // The terminal tab is the one surface that opts into the coach; every other
    // reuse of TerminalSection leaves it off.
    setup({ tab: "terminal" as const });
    expect(screen.getByText("Hatch a pet")).toBeInTheDocument();
  });

  it("renders a toast when present", () => {
    setup({ toast: "Otto is on the desktop" });
    expect(screen.getByText("Otto is on the desktop")).toBeInTheDocument();
  });
});
