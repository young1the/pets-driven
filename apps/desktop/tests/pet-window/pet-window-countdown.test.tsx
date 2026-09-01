import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PET_WINDOW_FIXTURES } from "@/pet-window/pet-window-fixtures";
import { PetWindowView } from "@/pet-window/pet-window-view";

// Preview mode (isTauri() === false) drives the presentation straight from the
// fixture, so the Tauri modules only need to resolve.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn(),
  listen: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
  LogicalSize: class {},
  LogicalPosition: class {},
}));
vi.mock("@/pet-window/pet-window-spritesheet", () => ({
  loadPetWindowSpritesheetUrl: vi.fn(() =>
    Promise.resolve({ url: "blob:sprite", dispose: () => {} }),
  ),
}));

const COUNTDOWN = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === "countdown")!;
const IDLE = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === "idle")!;

function renderPresentation(
  fixture: (typeof PET_WINDOW_FIXTURES)[number],
  presentation = fixture.presentation,
) {
  return render(<PetWindowView pet={fixture.pet} previewPresentation={presentation} />);
}

describe("round countdown", () => {
  it("shows the glyph the engine resolved", () => {
    const { container } = renderPresentation(COUNTDOWN);

    expect(container.querySelector(".pet-window-countdown")?.textContent).toBe("3️⃣");
  });

  it("stays away from a pet with no round starting", () => {
    const { container } = renderPresentation(IDLE);

    expect(container.querySelector(".pet-window-countdown")).toBeNull();
  });

  it("leaves the status card to the pet's own agent line", () => {
    const { container } = renderPresentation(COUNTDOWN, {
      ...COUNTDOWN.presentation,
      working: true,
      activity: "onTheMove",
    });

    // The countdown lives in the notice slot, so a working pet keeps its
    // capsule. Covering agent status is the one thing this app never does.
    expect(container.querySelector(".pet-window-countdown")).toBeTruthy();
    expect(container.querySelector(".pet-window-status-card")).toBeTruthy();
  });

  it("names the moment for a screen reader without reading out the digit", () => {
    renderPresentation(COUNTDOWN);

    expect(screen.getByLabelText("Round starting")).toBeTruthy();
  });
});
