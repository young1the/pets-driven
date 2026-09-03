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
const ROUND = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === "game-round")!;
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

    expect(container.querySelector(".pet-window-game--countdown")?.textContent).toBe("3️⃣");
  });

  it("stays away from a pet on no course at all", () => {
    const { container } = renderPresentation(IDLE);

    expect(container.querySelector(".pet-window-game")).toBeNull();
  });

  it("leaves the status card to the pet's own agent line", () => {
    const { container } = renderPresentation(COUNTDOWN, {
      ...COUNTDOWN.presentation,
      working: true,
      activity: "onTheMove",
    });

    // The countdown lives in the notice slot, so a working pet keeps its
    // capsule. Covering agent status is the one thing this app never does.
    expect(container.querySelector(".pet-window-game")).toBeTruthy();
    expect(container.querySelector(".pet-window-status-card")).toBeTruthy();
  });

  it("names the moment for a screen reader without reading out the digit", () => {
    renderPresentation(COUNTDOWN);

    expect(screen.getByLabelText("Round starting")).toBeTruthy();
  });
});

describe("a round under way", () => {
  it("keeps saying there is a round on once the count has run out", () => {
    const { container } = renderPresentation(ROUND);

    // The whole complaint: at zero the pill used to vanish and the pet went
    // back to looking like one that had stopped walking for no reason.
    expect(container.querySelector(".pet-window-game")).toBeTruthy();
    expect(container.querySelector(".pet-window-game--countdown")).toBeNull();
  });

  it("shows what the pet has cleared", () => {
    const { container } = renderPresentation(ROUND);

    expect(container.querySelector(".pet-window-game__count")?.textContent).toBe("7");
    expect(screen.getByLabelText("Running, 7 cleared")).toBeTruthy();
  });

  it("draws the lane the pet may run in, and where in it the pet stands", () => {
    const { container } = renderPresentation(ROUND);

    const pip = container.querySelector<HTMLElement>(".pet-window-game__lane-pip");
    const anchor = container.querySelector<HTMLElement>(".pet-window-game__lane-anchor");
    // 62px forward of the anchor, in a lane running 90 back and 150 forward:
    // (62 + 90) / 240. The anchor sits at 90 / 240, off centre because the lane
    // is — there is more room toward the oncoming course.
    expect(pip?.style.left).toBe(`${((62 + 90) / 240) * 100}%`);
    expect(anchor?.style.left).toBe(`${(90 / 240) * 100}%`);
  });

  it("keeps the lane to the hand that can use it", () => {
    const { container } = renderPresentation(ROUND, {
      ...ROUND.presentation,
      game: { ...ROUND.presentation.game!, control: "pet" },
    });

    // A pet flying its own round is pinned to the anchor, so a meter showing it
    // parked in the middle of a lane it never uses is noise.
    expect(container.querySelector(".pet-window-game__lane")).toBeNull();
    expect(container.querySelector(".pet-window-game__count")).toBeTruthy();
  });

  it("says a round stopped at a gate is stopped", () => {
    const { container } = renderPresentation(ROUND, {
      ...ROUND.presentation,
      game: { ...ROUND.presentation.game!, phase: "blocked" },
    });

    // The game halting *is* the report: the agent is waiting on the user.
    expect(container.querySelector(".pet-window-game__mark")?.textContent).toBe("🚧");
    expect(screen.getByLabelText("Round halted, waiting on you")).toBeTruthy();
  });
});
