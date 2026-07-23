import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodexPetPackage } from "@/app/desktop-gateway";
import { PetEditSection } from "@/app/main-window/pet-edit-section";

vi.mock("@/app/onboarding/use-pet-spritesheet-url", () => ({
  usePetSpritesheetUrl: (assetId: string) => `blob:${assetId}`,
}));

const pet = {
  id: "otto",
  name: "Otto",
  assetId: "bloop",
  role: "Steady",
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
  folder: "core",
  cwd: null,
  memo: "",
  deployed: false,
  personalityId: "steady" as PetPersonalityId,
};

const assetOptions: CodexPetPackage[] = [
  { id: "bloop", displayName: "Bloop", description: "A blob", spritesheetPath: "bloop.webp" },
  { id: "cato", displayName: "Cato", description: "A cat", spritesheetPath: "cato.webp" },
];

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    pet,
    assetOptions,
    onAssetId: vi.fn(),
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

describe("PetEditSection look picker", () => {
  it("marks the pet's current look as the chosen one", () => {
    setup();

    const bloop = screen.getByRole("button", { name: /Bloop/ });
    const cato = screen.getByRole("button", { name: /Cato/ });

    expect(bloop).toHaveAttribute("aria-pressed", "true");
    expect(cato).toHaveAttribute("aria-pressed", "false");
  });

  it("re-skins the pet when another look is picked", () => {
    const onAssetId = vi.fn();
    setup({ onAssetId });

    fireEvent.click(screen.getByRole("button", { name: /Cato/ }));

    expect(onAssetId).toHaveBeenCalledWith("cato");
  });

  it("explains itself instead of showing an empty strip when nothing is installed", () => {
    setup({ assetOptions: [] });

    expect(screen.getByText("No installed looks to switch to yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cato/ })).toBeNull();
  });
});
