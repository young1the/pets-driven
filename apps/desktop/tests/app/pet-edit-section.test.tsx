import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PetEditSection } from "@/app/main-window/pet-edit-section";

const pet = {
  id: "otto",
  name: "Otto",
  assetId: "bloop",
  role: "Steady",
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
  folder: "core",
  cwd: null,
  note: "Watch the auth queue",
  personalityId: "steady" as PetPersonalityId,
  swapRunningDirections: false,
  agentProvider: null,
};

function setup(overrides = {}) {
  const props = {
    pet,
    onName: vi.fn(),
    onNote: vi.fn(),
    onPersonalityId: vi.fn(),
    onAgentProvider: vi.fn(),
    onSwapRunningDirections: vi.fn(),
    onPickFolder: vi.fn(),
    onOpenFolder: vi.fn(),
    onClearFolder: vi.fn(),
    onDelete: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
  render(<PetEditSection {...props} />);
  return props;
}

describe("PetEditSection", () => {
  it("shows the note and personality in the card preview", () => {
    setup();
    expect(screen.getAllByText("Watch the auth queue")).toHaveLength(2);
    expect(screen.getAllByText("Steady").length).toBeGreaterThan(0);
  });

  it("edits the name", () => {
    const onName = vi.fn();
    setup({ onName });
    fireEvent.change(screen.getByDisplayValue("Otto"), {
      target: { value: "Ottoman" },
    });
    expect(onName).toHaveBeenCalledWith("Ottoman");
  });

  it("edits the note", () => {
    const onNote = vi.fn();
    setup({ onNote });
    fireEvent.change(screen.getByPlaceholderText("Add a note about this pet…"), {
      target: { value: "watch auth" },
    });
    expect(onNote).toHaveBeenCalledWith("watch auth");
  });

  it("changes the personality", () => {
    const onPersonalityId = vi.fn();
    setup({ onPersonalityId });
    fireEvent.click(screen.getByRole("radio", { name: "Playful" }));
    expect(onPersonalityId).toHaveBeenCalledWith("playful");
  });

  it("returns home via Done", () => {
    const onDone = vi.fn();
    setup({ onDone });
    fireEvent.click(screen.getByText("Done"));
    expect(onDone).toHaveBeenCalled();
  });

  it("offers every atlas animation, idling by default", () => {
    setup();
    const picker = screen.getByLabelText("Animation") as HTMLSelectElement;
    expect(picker.value).toBe("idle");
    expect([...picker.options].map((option) => option.value)).toEqual([
      "idle",
      "running-right",
      "running-left",
      "waving",
      "jumping",
      "failed",
      "waiting",
      "running",
      "review",
    ]);
  });

  it("plays the picked animation on the card portrait", async () => {
    setup();
    const picker = screen.getByLabelText("Animation");
    fireEvent.change(picker, { target: { value: "jumping" } });

    expect((picker as HTMLSelectElement).value).toBe("jumping");
    // The atlas draws "jumping" from row 4, whatever frame the clock is on.
    const portrait = await screen.findByRole("img", { name: "Otto portrait" });
    expect(portrait.style.backgroundPosition.split(" ")[1]).toBe("-832px");
  });

  it("marks a pet with no agent of its own as following the default", () => {
    const onAgentProvider = vi.fn();
    setup({ onAgentProvider });

    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Codex" }));
    expect(onAgentProvider).toHaveBeenCalledWith("codex");
  });

  it("hands a pinned pet back to the default when Default is picked again", () => {
    const onAgentProvider = vi.fn();
    setup({ pet: { ...pet, agentProvider: "codex" }, onAgentProvider });

    expect(screen.getByRole("radio", { name: "Codex" })).toHaveAttribute("aria-checked", "true");

    // Null is the wire spelling of "unset it", not a third agent.
    fireEvent.click(screen.getByRole("radio", { name: "Default" }));
    expect(onAgentProvider).toHaveBeenCalledWith(null);
  });

  it("offers the running-direction swap unchecked by default", () => {
    const onSwapRunningDirections = vi.fn();
    setup({ onSwapRunningDirections });
    const swap = screen.getByLabelText("Swap running left/right") as HTMLInputElement;

    expect(swap.checked).toBe(false);
    fireEvent.click(swap);
    expect(onSwapRunningDirections).toHaveBeenCalledWith(true);
  });

  it("turns the swap back off once it is on", () => {
    const onSwapRunningDirections = vi.fn();
    setup({ pet: { ...pet, swapRunningDirections: true }, onSwapRunningDirections });
    const swap = screen.getByLabelText("Swap running left/right") as HTMLInputElement;

    expect(swap.checked).toBe(true);
    fireEvent.click(swap);
    expect(onSwapRunningDirections).toHaveBeenCalledWith(false);
  });

  it("previews the other directional row for a swapped pet", async () => {
    setup({ pet: { ...pet, swapRunningDirections: true } });
    fireEvent.change(screen.getByLabelText("Animation"), {
      target: { value: "running-right" },
    });

    // "Running right" is picked, but the swapped sheet draws it in row 2.
    const portrait = await screen.findByRole("img", { name: "Otto portrait" });
    expect(portrait.style.backgroundPosition.split(" ")[1]).toBe("-416px");
  });

  it("keeps the picked row for a pet that is not swapped", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Animation"), {
      target: { value: "running-right" },
    });

    const portrait = await screen.findByRole("img", { name: "Otto portrait" });
    expect(portrait.style.backgroundPosition.split(" ")[1]).toBe("-208px");
  });

  it("clears the folder via the clear button when a folder is set", () => {
    const onClearFolder = vi.fn();
    setup({ onClearFolder });
    fireEvent.click(screen.getByRole("button", { name: "Clear folder" }));
    expect(onClearFolder).toHaveBeenCalledTimes(1);
  });

  it("hides the clear button when no folder is set", () => {
    setup({ pet: { ...pet, folder: "" } });
    expect(screen.queryByRole("button", { name: "Clear folder" })).toBeNull();
  });

  it("opens the working folder in Explorer when a folder is set", () => {
    const onOpenFolder = vi.fn();
    setup({ onOpenFolder });
    fireEvent.click(screen.getByRole("button", { name: "Open in Explorer" }));
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it("hides the open button when no folder is set", () => {
    setup({ pet: { ...pet, folder: "" } });
    expect(screen.queryByRole("button", { name: "Open in Explorer" })).toBeNull();
  });
});
