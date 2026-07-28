import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PET_WINDOW_FIXTURES } from "@/pet-window/pet-window-fixtures";
import { carryingFromPet } from "@/pet-window/pet-window-projection";
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

const FRESH = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === "trinket")!;
const EXPIRING = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === "trinket-expiring")!;
const IDLE = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === "idle")!;

function renderFixture(fixture: (typeof PET_WINDOW_FIXTURES)[number]) {
  return render(<PetWindowView pet={fixture.pet} previewPresentation={fixture.presentation} />);
}

function petSnapshot(carrying: PetSnapshot["carrying"]): PetSnapshot {
  return {
    id: "pet-a",
    sourceId: "agent-a",
    name: "Alice",
    steering: "arrive",
    locomotion: "fly",
    speech: null,
    position: { x: 0, y: 0 },
    contact: { grounded: false, climbableSurfaceId: null },
    motionTarget: null,
    decision: null,
    pendingReaction: null,
    carrying,
  };
}

describe("pet window trinket countdown", () => {
  it("shows how long a collected ability has left", () => {
    renderFixture(FRESH);

    expect(screen.getByLabelText("Wings, 48 seconds left")).toBeInTheDocument();
    expect(screen.getByText("48s")).toBeInTheDocument();
  });

  it("shows nothing for a pet that is wearing no trinket", () => {
    renderFixture(IDLE);

    expect(document.querySelector(".pet-window-status-card__trinket")).toBeNull();
  });

  it("keeps the countdown in the always-visible row, not behind the hover expansion", () => {
    // The deadline is the whole point of the badge: a warning the user has to
    // go looking for is not a warning.
    const { container } = renderFixture(FRESH);

    expect(
      container.querySelector(".pet-window-status-card__row > .pet-window-status-card__trinket"),
    ).not.toBeNull();
  });

  it("drains the bar in proportion to the time left", () => {
    const { container } = renderFixture(FRESH);
    const drain = container.querySelector<HTMLElement>(".pet-window-status-card__trinket")!;

    expect(drain.style.getPropertyValue("--pet-window-trinket-remaining")).toBe(String(48 / 60));
  });

  it("switches to the warning tone over the last seconds", () => {
    const { container } = renderFixture(EXPIRING);

    expect(container.querySelector(".pet-window-status-card__trinket--expiring")).not.toBeNull();
    expect(screen.getByLabelText("Climbing claws, 4 seconds left")).toBeInTheDocument();
  });

  it("leaves a fresh pickup out of the warning tone", () => {
    const { container } = renderFixture(FRESH);

    expect(container.querySelector(".pet-window-status-card__trinket--expiring")).toBeNull();
  });
});

describe("trinket countdown projection", () => {
  it("turns the pet's ability deadline into seconds against the world clock", () => {
    expect(
      carryingFromPet(
        petSnapshot({ kind: "wings", pickedUpAt: 10_000, expiresAt: 70_000 }),
        40_000,
      ),
    ).toEqual({ kind: "wings", remainingSeconds: 30, totalSeconds: 60 });
  });

  it("reports nothing for a pet wearing no trinket", () => {
    expect(carryingFromPet(petSnapshot(null), 40_000)).toBeNull();
  });

  it("withholds the countdown when the snapshot carries no clock reading", () => {
    // `expiresAt` is on the simulation clock, which is neither wall time nor
    // recoverable from the snapshot — so with no reading there is no duration
    // to show, and a badge counting against nothing would be a lie.
    expect(
      carryingFromPet(
        petSnapshot({ kind: "wings", pickedUpAt: 10_000, expiresAt: 70_000 }),
        undefined,
      ),
    ).toBeNull();
  });
});
