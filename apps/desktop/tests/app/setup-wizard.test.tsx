import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DesktopGateway } from "@/app/desktop-gateway";
import { SetupWizard } from "@/app/onboarding/setup-wizard";
import { createEmptyPetsDrivenState } from "@/app-state/pets-driven-state";

const PETDEX_FOLDER = "C:\\Users\\tester\\.petdex\\pets";

function createGateway(
  packages: Awaited<ReturnType<DesktopGateway["listDesignatedPetPackages"]>>,
): DesktopGateway {
  return {
    listDesignatedPetPackages: vi.fn().mockResolvedValue(packages),
    listPetSourceDirectoryOptions: vi.fn().mockResolvedValue([
      { kind: "petdex", path: PETDEX_FOLDER },
      { kind: "codex", path: "C:\\Users\\tester\\.codex\\pets" },
    ]),
    listTerminalShells: vi.fn().mockResolvedValue([]),
    updateSettings: vi.fn().mockResolvedValue(null),
    pickDirectory: vi.fn().mockResolvedValue(null),
    revealPath: vi.fn().mockResolvedValue(undefined),
    copyBundledPetsToSourceDirectory: vi.fn().mockResolvedValue(6),
    getClaudePluginStatus: vi.fn().mockResolvedValue({
      state: "not-installed",
      version: null,
      error: null,
    }),
    getCodexPluginStatus: vi.fn().mockResolvedValue({
      state: "not-installed",
      version: null,
      error: null,
    }),
  } as unknown as DesktopGateway;
}

function openPetsFolderStep(gateway: DesktopGateway, petSourceDirectory: string | null) {
  render(
    <SetupWizard
      gateway={gateway}
      onCreatePet={vi.fn()}
      onDone={vi.fn()}
      onStateChange={vi.fn()}
      state={{ ...createEmptyPetsDrivenState(), petSourceDirectory }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Get started →" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue →" }));
}

describe("SetupWizard pet folder step", () => {
  it("shows one folder card and quiet secondary links when pets exist", async () => {
    openPetsFolderStep(
      createGateway([
        {
          id: "boba",
          displayName: "Boba",
          description: "A cozy Petdex pet.",
          spritesheetPath: "boba/spritesheet.webp",
        },
      ]),
      PETDEX_FOLDER,
    );

    const folderCard = screen.getByRole("group", { name: "Pet folder location" });
    await waitFor(() => expect(within(folderCard).getByText("1 found")).toBeInTheDocument());
    expect(folderCard.querySelector("strong")).toHaveTextContent("Petdex default");
    expect(within(folderCard).getByText(PETDEX_FOLDER)).toBeInTheDocument();
    expect(screen.getByText("1 pet looks ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Petdex" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add pets from the terminal/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy default pets to this folder" })).toBeNull();
  });

  it("keeps empty-folder recovery actions inside the empty state", async () => {
    openPetsFolderStep(createGateway([]), PETDEX_FOLDER);

    expect(
      await screen.findByText(
        "This folder is empty. Start with the default pets or find a new one.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy default pets to this folder" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Petdex" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add pets from the terminal/ })).toBeNull();
  });

  it("hides pet acquisition choices until a folder is selected", async () => {
    const gateway = createGateway([
      {
        id: "boba",
        displayName: "Boba",
        description: "A cozy Petdex pet.",
        spritesheetPath: "boba/spritesheet.webp",
      },
    ]);
    openPetsFolderStep(gateway, null);

    expect(await screen.findByText("No folder selected")).toBeInTheDocument();
    expect(screen.queryByText("Boba")).toBeNull();
    expect(screen.queryByRole("link", { name: "Browse Petdex" })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Choose folder" }), {
      target: { value: PETDEX_FOLDER },
    });

    await waitFor(() =>
      expect(gateway.updateSettings).toHaveBeenCalledWith({
        petSourceDirectory: PETDEX_FOLDER,
      }),
    );
  });
});
