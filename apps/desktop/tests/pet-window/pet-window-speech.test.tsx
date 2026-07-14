import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PET_WINDOW_FIXTURES } from "@/pet-window/pet-window-fixtures";
import { PetWindowView } from "@/pet-window/pet-window-view";

// Preview mode (isTauri() === false) drives the presentation straight from the
// fixture, so the Tauri modules only need to resolve — none of them is called.
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

describe("pet window speech line", () => {
  it("renders the pet's spoken line in the status card", () => {
    const chatting = PET_WINDOW_FIXTURES.find((f) => f.id === "chatting")!;

    render(<PetWindowView pet={chatting.pet} previewPresentation={chatting.presentation} />);

    // The greet/chat dialogue surfaces as the status card's message line,
    // alongside the "Chatting with Scout" capsule label.
    expect(screen.getByText("Guess what?")).toBeInTheDocument();
  });

  it("shows no message line when the pet is quiet", () => {
    const idle = PET_WINDOW_FIXTURES.find((f) => f.id === "idle")!;

    render(<PetWindowView pet={idle.pet} previewPresentation={idle.presentation} />);

    expect(screen.queryByText("Guess what?")).not.toBeInTheDocument();
  });
});
