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
  memo: "Watch the auth queue",
  personalityId: "steady" as PetPersonalityId,
};

function setup(overrides = {}) {
  const props = {
    pet,
    onName: vi.fn(),
    onMemo: vi.fn(),
    onPersonalityId: vi.fn(),
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

  it("edits the memo", () => {
    const onMemo = vi.fn();
    setup({ onMemo });
    fireEvent.change(screen.getByPlaceholderText("Add a note about this pet…"), {
      target: { value: "watch auth" },
    });
    expect(onMemo).toHaveBeenCalledWith("watch auth");
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
