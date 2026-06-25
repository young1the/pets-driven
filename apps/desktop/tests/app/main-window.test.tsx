import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  onPickFolder: vi.fn(),
  onToggleDeployed: vi.fn(),
  onDelete: vi.fn(),
  onDone: vi.fn(),
};
const settings = {
  shell: "bash",
  command: "claude",
  onShell: vi.fn(),
  onCommand: vi.fn(),
  confirmRun: true,
  onToggleConfirm: vi.fn(),
  preview: { cwd: "~/core", prompt: "$", command: "claude" },
  hook: {
    tone: "success" as const,
    label: "All connected",
    summary: "ok",
    url: "",
  },
  onReconnect: vi.fn(),
};
const debug = { groups: [], error: null };

function setup(overrides = {}) {
  const props = {
    tab: "home" as const,
    onTab: vi.fn(),
    editPet: null,
    home,
    edit,
    settings,
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
    expect(screen.getByText(/Good morning/)).toBeInTheDocument();
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
        assetId: "patamon",
        role: "Steady",
        status: { label: "Idle", tone: "neutral", dotColor: "var(--ink-300)" },
        gradient: { from: "#8B7FE8", to: "#6F5FD6" },
        folder: "core",
        memo: "",
        deployed: false,
      },
    });
    expect(screen.getByText("Pet details")).toBeInTheDocument();
  });

  it("renders a toast when present", () => {
    setup({ toast: "Otto is on the desktop" });
    expect(screen.getByText("Otto is on the desktop")).toBeInTheDocument();
  });
});
