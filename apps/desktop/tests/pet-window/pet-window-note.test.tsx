import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PET_WINDOW_FIXTURES } from "@/pet-window/pet-window-fixtures";
import { PetWindowView } from "@/pet-window/pet-window-view";
import { NOTE_IDLE_INTERVAL_MS, NOTE_SPEAK_DURATION_MS } from "@/pet-window/use-pet-window-note";

// Preview mode (isTauri() === false) drives the note and presentation straight
// from the fixture, so the Tauri modules only need to resolve.
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

const NOTE_FIXTURE = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === "note")!;
const IDLE_FIXTURE = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === "idle")!;

function renderNotePet(note?: string) {
  return render(
    <PetWindowView
      pet={NOTE_FIXTURE.pet}
      previewNote={note ?? NOTE_FIXTURE.note}
      previewPresentation={NOTE_FIXTURE.presentation}
    />,
  );
}

describe("pet window note", () => {
  it("marks a pet that carries a note with a badge", () => {
    renderNotePet();

    expect(screen.getByLabelText("Has a note")).toBeInTheDocument();
  });

  it("shows no badge when the pet has no note", () => {
    render(
      <PetWindowView pet={IDLE_FIXTURE.pet} previewPresentation={IDLE_FIXTURE.presentation} />,
    );

    expect(screen.queryByLabelText("Has a note")).not.toBeInTheDocument();
  });

  it("treats a whitespace-only note as no note at all", () => {
    renderNotePet("   ");

    expect(screen.queryByLabelText("Has a note")).not.toBeInTheDocument();
  });

  it("keeps the note text out of the card until it is asked for", () => {
    renderNotePet();

    expect(screen.queryByText(NOTE_FIXTURE.note!)).not.toBeInTheDocument();
  });

  it("opens the note when the pet is hovered", () => {
    const { container } = renderNotePet();
    const surface = container.querySelector(".pet-window-surface")!;

    fireEvent.pointerMove(surface, { clientX: 96, clientY: 190 });

    expect(screen.getByText(NOTE_FIXTURE.note!)).toBeInTheDocument();
  });

  it("stacks the note above the spoken line when both are up", () => {
    const { container } = render(
      <PetWindowView
        pet={NOTE_FIXTURE.pet}
        previewNote={NOTE_FIXTURE.note}
        previewPresentation={{
          ...NOTE_FIXTURE.presentation,
          overlay: { kind: "agent-channel", status: null, label: null, message: "Guess what?" },
        }}
      />,
    );
    const surface = container.querySelector(".pet-window-surface")!;

    fireEvent.pointerMove(surface, { clientX: 96, clientY: 190 });

    // The note is standing context the user wrote; the spoken line turns over
    // every few seconds, so it must never push the note down the card.
    const stacked = Array.from(
      container.querySelectorAll(".pet-window-status-card__note, .pet-window-status-card__message"),
    ).map((element) => element.textContent);

    expect(stacked).toEqual([NOTE_FIXTURE.note, "Guess what?"]);
  });
});

describe("pet window note recital", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not recite a note the pet already had when its window opened", () => {
    renderNotePet();

    act(() => vi.advanceTimersByTime(NOTE_SPEAK_DURATION_MS));

    expect(screen.queryByText(NOTE_FIXTURE.note!)).not.toBeInTheDocument();
  });

  it("says a newly saved note straight away, then falls quiet", () => {
    const { rerender } = renderNotePet();

    rerender(
      <PetWindowView
        pet={NOTE_FIXTURE.pet}
        previewNote="Rebase before the demo."
        previewPresentation={NOTE_FIXTURE.presentation}
      />,
    );

    expect(screen.getByText("Rebase before the demo.")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(NOTE_SPEAK_DURATION_MS));

    expect(screen.queryByText("Rebase before the demo.")).not.toBeInTheDocument();
  });

  it("brings the note back up on its own while the pet is quiet", () => {
    renderNotePet();

    act(() => vi.advanceTimersByTime(NOTE_IDLE_INTERVAL_MS));

    expect(screen.getByText(NOTE_FIXTURE.note!)).toBeInTheDocument();
  });

  it("stays quiet while the pet has a line of its own to say", () => {
    render(
      <PetWindowView
        pet={NOTE_FIXTURE.pet}
        previewNote={NOTE_FIXTURE.note}
        previewPresentation={{
          ...NOTE_FIXTURE.presentation,
          overlay: { kind: "agent-channel", status: null, label: null, message: "Guess what?" },
        }}
      />,
    );

    act(() => vi.advanceTimersByTime(NOTE_IDLE_INTERVAL_MS));

    // The engine owns the single message line; the note must not talk over it.
    expect(screen.getByText("Guess what?")).toBeInTheDocument();
    expect(screen.queryByText(NOTE_FIXTURE.note!)).not.toBeInTheDocument();
  });
});
