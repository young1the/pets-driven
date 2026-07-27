import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { desktopGateway } from "@/app/desktop-gateway";
import { EmbeddedTerminal } from "@/app/main-window/embedded-terminal";

const paste = vi.fn();
const focus = vi.fn();

// xterm draws through a canvas and measures characters with it, neither of
// which jsdom provides. The component only asks for a small surface of it, so
// stand in for the real thing and watch what it is told to do.
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    paste = paste;
    focus = focus;
    write() {}
    open() {}
    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onData() {
      return { dispose() {} };
    }
    dispose() {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

const SESSION_ID = "session-1";
const COMMAND = "npx @pets-driven/plugin install";

/** Feeds one chunk of PTY output to whatever the component subscribed with. */
let emitData: (id: string, text: string) => void;

function stubGateway() {
  let handler: (event: { id: string; data: number[] }) => void = () => {};
  emitData = (id, text) => {
    act(() => {
      handler({ id, data: Array.from(new TextEncoder().encode(text)) });
    });
  };

  vi.spyOn(desktopGateway, "isDesktopRuntime").mockReturnValue(true);
  vi.spyOn(desktopGateway, "openTerminal").mockResolvedValue(SESSION_ID);
  vi.spyOn(desktopGateway, "writeTerminal").mockResolvedValue(undefined);
  vi.spyOn(desktopGateway, "resizeTerminal").mockResolvedValue(undefined);
  vi.spyOn(desktopGateway, "closeTerminal").mockResolvedValue(undefined);
  vi.spyOn(desktopGateway, "subscribeTerminalExit").mockResolvedValue(() => {});
  vi.spyOn(desktopGateway, "subscribeTerminalData").mockImplementation(async (fn) => {
    handler = fn;
    return () => {};
  });
}

/** Lets the effect's `await openTerminal(...)` chain settle. */
async function openSession() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("EmbeddedTerminal prefill", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    paste.mockReset();
    focus.mockReset();
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    stubGateway();
  });

  it("holds the command back until the shell has drawn its prompt", async () => {
    render(<EmbeddedTerminal exitedLabel="[exited]" prefill={COMMAND} />);
    await openSession();

    // Sending now would land in a prompt that is still being painted, and a
    // command the user cannot read is one they cannot review.
    expect(paste).not.toHaveBeenCalled();

    emitData(SESSION_ID, "user@host:~$ ");

    expect(paste).toHaveBeenCalledWith(COMMAND);
  });

  it("never sends the newline that would run it", async () => {
    render(<EmbeddedTerminal exitedLabel="[exited]" prefill={COMMAND} />);
    await openSession();
    emitData(SESSION_ID, "user@host:~$ ");

    // The whole point: the app types, the user presses Enter.
    for (const [, data] of vi.mocked(desktopGateway.writeTerminal).mock.calls) {
      expect(data).not.toContain("\r");
      expect(data).not.toContain("\n");
    }
    expect(paste.mock.calls[0][0]).not.toMatch(/[\r\n]/);
  });

  it("focuses the terminal so Enter is the only keystroke left", async () => {
    render(<EmbeddedTerminal exitedLabel="[exited]" prefill={COMMAND} />);
    await openSession();
    emitData(SESSION_ID, "user@host:~$ ");

    expect(focus).toHaveBeenCalled();
  });

  it("types the command once, not on every chunk of output", async () => {
    render(<EmbeddedTerminal exitedLabel="[exited]" prefill={COMMAND} />);
    await openSession();

    emitData(SESSION_ID, "user@host:~$ ");
    emitData(SESSION_ID, "some output\r\n");

    expect(paste).toHaveBeenCalledTimes(1);
  });

  it("ignores output from another session", async () => {
    render(<EmbeddedTerminal exitedLabel="[exited]" prefill={COMMAND} />);
    await openSession();

    emitData("someone-elses-session", "user@host:~$ ");

    expect(paste).not.toHaveBeenCalled();
  });

  it("stays out of the way when there is nothing to prefill", async () => {
    render(<EmbeddedTerminal exitedLabel="[exited]" />);
    await openSession();

    emitData(SESSION_ID, "user@host:~$ ");

    expect(paste).not.toHaveBeenCalled();
  });
});
