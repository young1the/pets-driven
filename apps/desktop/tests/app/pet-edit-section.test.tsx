import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PetEditSection } from "@/app/main-window/pet-edit-section";

const pet = {
  id: "otto",
  name: "Otto",
  assetId: "patamon",
  role: "Steady",
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
  folder: "core",
  cwd: null,
  memo: "Watch the auth queue",
  deployed: false,
};

function setup(overrides = {}) {
  const props = {
    pet,
    onName: vi.fn(),
    onMemo: vi.fn(),
    onPickFolder: vi.fn(),
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
    expect(screen.getByText("Steady")).toBeInTheDocument();
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

  it("returns home via Done", () => {
    const onDone = vi.fn();
    setup({ onDone });
    fireEvent.click(screen.getByText("Done"));
    expect(onDone).toHaveBeenCalled();
  });
});
