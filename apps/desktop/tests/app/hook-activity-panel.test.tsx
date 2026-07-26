import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HookActivityPanel } from "@/app/main-window/hook-activity-panel";

function setup(overrides = {}) {
  const props = {
    endpoint: "http://127.0.0.1:43187/claude-hook",
    error: null as string | null,
    activity: [] as { at: number; label: string; accepted: boolean }[],
    rejectedCount: 0,
    onSendTest: vi.fn().mockResolvedValue("HTTP/1.1 200 OK"),
    ...overrides,
  };
  render(<HookActivityPanel {...props} />);
  return props;
}

describe("HookActivityPanel", () => {
  it("names the endpoint the hook script has to reach", () => {
    // Nothing else in the UI says where the hooks are supposed to go, so a
    // misconfigured forward script is otherwise undiagnosable in a release build.
    setup();

    expect(screen.getByText("http://127.0.0.1:43187/claude-hook")).toBeInTheDocument();
  });

  it("shows the bind failure verbatim rather than the generic summary", () => {
    // "address already in use" means a second copy of the app owns the port —
    // a different fix from the card's "try restarting the app".
    setup({ error: "address already in use" });

    expect(screen.getByText("address already in use")).toBeInTheDocument();
  });

  it("lists arrivals and rejections apart, so a bouncing hook is not silence", () => {
    setup({
      activity: [
        { at: 1_700_000_002_000, label: "404 Not Found", accepted: false },
        { at: 1_700_000_001_000, label: "PreToolUse", accepted: true },
      ],
      rejectedCount: 1,
    });

    expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    expect(screen.getByText("404 Not Found")).toBeInTheDocument();
    expect(screen.getByText(/1 turned away/)).toBeInTheDocument();
  });

  it("says so plainly when nothing has arrived", () => {
    setup();

    expect(screen.getByText("Nothing has reached the app yet.")).toBeInTheDocument();
  });

  it("reports the status line the self-test came back with", async () => {
    const { onSendTest } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Send a test event" }));

    expect(onSendTest).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("HTTP/1.1 200 OK")).toBeInTheDocument());
  });

  it("reports a self-test that could not reach the listener", async () => {
    // The failure is the answer here — an unreachable listener is exactly the
    // condition the panel exists to name.
    setup({ onSendTest: vi.fn().mockRejectedValue(new Error("Could not reach the ingress")) });

    fireEvent.click(screen.getByRole("button", { name: "Send a test event" }));

    await waitFor(() =>
      expect(screen.getByText("Could not reach the ingress")).toBeInTheDocument(),
    );
  });
});
