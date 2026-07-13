import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PetEditSection } from "@/app/main-window/pet-edit-section";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

const pet = {
  id: "otto",
  name: "Otto",
  assetId: "bloop",
  role: "Steady",
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
  folder: "core",
  cwd: null,
  memo: "Watch the auth queue",
  deployed: false,
  personalityId: "steady" as PetPersonalityId,
};

function setup(overrides = {}) {
  const props = {
    pet,
    onName: vi.fn(),
    onMemo: vi.fn(),
    onPersonalityId: vi.fn(),
    onPickFolder: vi.fn(),
    onClearFolder: vi.fn(),
    onToggleDeployed: vi.fn(),
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
    fireEvent.change(
      screen.getByPlaceholderText("Add a note about this pet…"),
      {
        target: { value: "watch auth" },
      },
    );
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

  it("toggles show-on-desktop by clicking its label text", () => {
    const onToggleDeployed = vi.fn();
    setup({ onToggleDeployed });
    fireEvent.click(screen.getByText("Show on desktop"));
    expect(onToggleDeployed).toHaveBeenCalledTimes(1);
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
});
