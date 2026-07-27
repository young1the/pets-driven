import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PluginRunTerminal } from "@/app/main-window/plugin-run-terminal";

// Stand in for the xterm-backed terminal with buttons that drive its running
// signal, so a test can start and finish a command without a PTY behind it.
vi.mock("@/app/main-window/embedded-terminal", () => ({
  EmbeddedTerminal: ({ onRunningChange }: { onRunningChange?: (running: boolean) => void }) => (
    <>
      <button onClick={() => onRunningChange?.(true)} type="button">
        press enter
      </button>
      <button onClick={() => onRunningChange?.(false)} type="button">
        command finished
      </button>
    </>
  ),
}));

const RUN = { provider: "claude" as const, action: "install" as const, line: "npx install-line" };
const RUNNING_HINT = "The command has started. Closing now stops it partway.";

async function openRun() {
  const onClose = vi.fn();
  render(<PluginRunTerminal available onClose={onClose} run={RUN} />);
  // The terminal is lazy-loaded; wait for the chunk before touching it.
  const enter = await screen.findByText("press enter");
  return {
    onClose,
    pressEnter: () => fireEvent.click(enter),
    finish: () => fireEvent.click(screen.getByText("command finished")),
  };
}

describe("PluginRunTerminal closing", () => {
  it("closes straight away while the command is still waiting at the prompt", async () => {
    const { onClose } = await openRun();

    fireEvent.click(screen.getByText("Close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("asks first while the command is running", async () => {
    // Closing tears down the PTY, which mid-install leaves the plugin half
    // written — so the click that would do it gets a question in front of it.
    const { onClose, pressEnter } = await openRun();
    pressEnter();

    fireEvent.click(screen.getByText("Close"));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(RUNNING_HINT)).toBeInTheDocument();
  });

  it("closes on the second, deliberate click", async () => {
    const { onClose, pressEnter } = await openRun();
    pressEnter();

    fireEvent.click(screen.getByText("Close"));
    fireEvent.click(screen.getByText("Close anyway"));

    expect(onClose).toHaveBeenCalled();
  });

  it("backs out of the confirm with the run still open", async () => {
    const { onClose, pressEnter } = await openRun();
    pressEnter();

    fireEvent.click(screen.getByText("Close"));
    fireEvent.click(screen.getByText("Keep it open"));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(RUNNING_HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes straight away again once the install has finished", async () => {
    // The install is over and the shell is back at its prompt, so there is
    // nothing left for the close to interrupt.
    const { onClose, pressEnter, finish } = await openRun();
    pressEnter();
    finish();

    fireEvent.click(screen.getByText("Close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("drops a confirm that the finished command left behind", async () => {
    const { pressEnter, finish } = await openRun();
    pressEnter();
    fireEvent.click(screen.getByText("Close"));

    finish();

    expect(screen.queryByText(RUNNING_HINT)).not.toBeInTheDocument();
  });
});
