import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalSection } from "@/app/main-window/terminal-section";

const DISMISSED_STORAGE_KEY = "pets-driven:terminal-onboarding-dismissed";

/** The first step's title — the cheapest proof that the coach is on screen. */
const COACH_TITLE = "Hatch a pet";

function renderSection(overrides: Record<string, unknown> = {}) {
  render(
    <TerminalSection
      available={false}
      pickDirectory={vi.fn().mockResolvedValue(null)}
      {...overrides}
    />,
  );
}

describe("TerminalSection onboarding opt-in", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps the coach off by default, the way the setup wizard reuses it", () => {
    renderSection();

    expect(screen.queryByText(COACH_TITLE)).not.toBeInTheDocument();
  });

  it("hides the tips button too, so the coach cannot be summoned", () => {
    renderSection();

    expect(screen.queryByText("Tips")).not.toBeInTheDocument();
  });

  it("neither reads nor writes the dismissed flag while the coach is off", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    renderSection();

    // Dismissing the coach on a borrowed surface used to burn the one greeting
    // the terminal tab owes the user; off means the flag is untouched entirely.
    expect(getItem).not.toHaveBeenCalledWith(DISMISSED_STORAGE_KEY);
    expect(setItem).not.toHaveBeenCalledWith(DISMISSED_STORAGE_KEY, expect.anything());
  });

  it("shows the coach when a surface opts in", () => {
    renderSection({ showOnboarding: true });

    expect(screen.getByText(COACH_TITLE)).toBeInTheDocument();
  });

  it("still honours a previously dismissed coach when opted in", () => {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, "true");

    renderSection({ showOnboarding: true });

    expect(screen.queryByText(COACH_TITLE)).not.toBeInTheDocument();
    expect(screen.getByText("Tips")).toBeInTheDocument();
  });
});
