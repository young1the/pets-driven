import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PluginRunTerminal } from "@/app/main-window/plugin-run-terminal";

// Stand in for the xterm-backed terminal with a button that fires the submit
// signal, so a test can accept the command without a PTY behind it.
vi.mock("@/app/main-window/embedded-terminal", () => ({
  EmbeddedTerminal: ({ onPrefillSubmitted }: { onPrefillSubmitted?: () => void }) => (
    <button onClick={() => onPrefillSubmitted?.()} type="button">
      press enter
    </button>
  ),
}));

const RUN = { provider: "claude" as const, action: "install" as const, line: "npx install-line" };
const RUNNING_HINT = "The command has started. Closing now stops it partway.";

async function openRun() {
  const onClose = vi.fn();
  render(<PluginRunTerminal available onClose={onClose} run={RUN} />);
  // The terminal is lazy-loaded; wait for the chunk before touching it.
  const enter = await screen.findByText("press enter");
  return { onClose, pressEnter: () => fireEvent.click(enter) };
}

describe("PluginRunTerminal closing", () => {
  it("closes straight away while the command is still waiting at the prompt", async () => {
    const { onClose } = await openRun();

    fireEvent.click(screen.getByText("Close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("asks first once the command has been accepted", async () => {
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
});
