import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DesktopGateway } from "@/app/desktop-gateway";
import { AdoptPetFlow } from "@/app/onboarding/adopt-pet-flow";
import { createEmptyPetsDrivenState } from "@/app-state/pets-driven-state";

function createGateway(
  packages: Awaited<ReturnType<DesktopGateway["listPetPackages"]>>,
): DesktopGateway {
  return {
    readPetsDrivenState: vi.fn(),
    writePetsDrivenState: vi.fn(),
    listPetPackages: vi.fn().mockResolvedValue(packages),
    listTerminalShells: vi.fn().mockResolvedValue([]),
    openAdoptedPetWindow: vi.fn(),
    closeAdoptedPetWindow: vi.fn(),
    openPetContextMenu: vi.fn(),
    pickDirectory: vi.fn(),
    getDefaultPetSourceDirectory: vi.fn().mockResolvedValue(null),
    getClaudePluginStatus: vi.fn().mockResolvedValue({
      state: "not-installed",
      version: null,
      error: null,
    }),
    planClaudePluginCommand: vi.fn().mockResolvedValue({
      line: "claude plugin install pets-driven@pets-driven --scope user",
      status: { state: "not-installed", version: null, error: null },
    }),
    installClaudePlugin: vi.fn().mockResolvedValue({
      state: "installed",
      version: "0.1.0",
      error: null,
    }),
    uninstallClaudePlugin: vi.fn().mockResolvedValue({
      state: "not-installed",
      version: null,
      error: null,
    }),
    isDesktopRuntime: vi.fn().mockReturnValue(false),
    loadPetSpritesheet: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    getClaudeHookIngressStatus: vi.fn().mockResolvedValue({
      url: "",
      state: "error",
      error: null,
    }),
    closeAllPetWindows: vi.fn().mockResolvedValue(undefined),
    focusForeignWindow: vi.fn().mockResolvedValue(false),
    startSession: vi.fn().mockResolvedValue(null),
    connectForeignWindow: vi.fn().mockResolvedValue(null),
    subscribeClaudeHookIngress: vi.fn().mockResolvedValue(() => {}),
    subscribePetsDrivenStateChanged: vi.fn().mockResolvedValue(() => {}),
    subscribePetCommand: vi.fn().mockResolvedValue(() => {}),
    openTerminal: vi.fn().mockResolvedValue(""),
    writeTerminal: vi.fn().mockResolvedValue(undefined),
    resizeTerminal: vi.fn().mockResolvedValue(undefined),
    closeTerminal: vi.fn().mockResolvedValue(undefined),
    subscribeTerminalData: vi.fn().mockResolvedValue(() => {}),
    subscribeTerminalExit: vi.fn().mockResolvedValue(() => {}),
  };
}

function renderOnboarding(gateway: DesktopGateway) {
  render(
    <AdoptPetFlow
      gateway={gateway}
      onDone={vi.fn()}
      onStateChange={vi.fn()}
      state={createEmptyPetsDrivenState()}
    />,
  );
}

describe("AdoptPetFlow Petdex CTA", () => {
  it("can open directly on the empty Pet Asset selection state", async () => {
    render(
      <AdoptPetFlow
        gateway={createGateway([])}
        onDone={vi.fn()}
        onStateChange={vi.fn()}
        state={createEmptyPetsDrivenState()}
      />,
    );

    expect(await screen.findByText("No pet looks installed yet.")).toBeInTheDocument();
    expect(screen.queryByText("Get started →")).not.toBeInTheDocument();
  });

  it("offers Petdex from the choose step when local pet packs exist", async () => {
    renderOnboarding(
      createGateway([
        {
          id: "boba",
          displayName: "Boba",
          description: "A cozy Petdex pet.",
          spritesheetPath: "boba/spritesheet.webp",
        },
      ]),
    );

    let petName: HTMLElement | null = null;
    await waitFor(() => {
      petName = screen.getByText("Boba");
      expect(petName).toBeTruthy();
    });

    const petdexCopy = screen.getByText("Want more looks? Install pets from Petdex.");
    expect(petdexCopy).toBeTruthy();
    expect(
      Boolean(petName!.compareDocumentPosition(petdexCopy) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(screen.getByRole("link", { name: "Open Petdex" }).getAttribute("href")).toBe(
      "https://petdex.dev",
    );
  });

  it("shows a Petdex install command when no local pet packs exist", async () => {
    renderOnboarding(createGateway([]));

    await waitFor(() => {
      expect(screen.getByText("No pet looks installed yet.")).toBeTruthy();
    });

    expect(screen.getByText("npx petdex install boba")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse Petdex" }).getAttribute("href")).toBe(
      "https://petdex.dev",
    );
  });
});

describe("AdoptPetFlow pet source folders", () => {
  it("lets the user choose a Petdex folder from the empty state", async () => {
    const gateway = createGateway([]);
    gateway.pickDirectory = vi.fn().mockResolvedValue("D:\\pets\\mine");
    const onStateChange = vi.fn();

    render(
      <AdoptPetFlow
        gateway={gateway}
        onDone={vi.fn()}
        onStateChange={onStateChange}
        state={createEmptyPetsDrivenState()}
      />,
    );

    const chooseFolder = await screen.findByText("Choose a Petdex folder");
    fireEvent.click(chooseFolder);

    await waitFor(() => {
      expect(gateway.writePetsDrivenState).toHaveBeenCalledWith(
        expect.objectContaining({
          petSourceDirectory: "D:\\pets\\mine",
        }),
      );
    });

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ petSourceDirectory: "D:\\pets\\mine" }),
    );
    // The pet-pack roots are rescanned once on mount and again after the
    // folder is added, so the new folder's packs surface immediately.
    expect(gateway.listPetPackages).toHaveBeenCalledTimes(2);
  });
});

describe("AdoptPetFlow Claude Code connect", () => {
  it("offers the Claude plugin install on the done step", async () => {
    const gateway = createGateway([
      {
        id: "boba",
        displayName: "Boba",
        description: "A cozy Petdex pet.",
        spritesheetPath: "boba/spritesheet.webp",
      },
    ]);
    renderOnboarding(gateway);

    fireEvent.click(await screen.findByText("Boba"));
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Looks good →"));
    fireEvent.click(screen.getByText("Adopt without a folder →"));

    expect(await screen.findByText("Connect Claude Code")).toBeInTheDocument();

    fireEvent.click(await screen.findByText("Install"));

    // The install is not run here: it is handed to the in-app terminal so the
    // user can watch it and answer anything the CLI asks.
    await waitFor(() => {
      expect(gateway.planClaudePluginCommand).toHaveBeenCalledWith("install");
    });
    expect(gateway.installClaudePlugin).not.toHaveBeenCalled();
    expect(await screen.findByText("Installing the plugin")).toBeInTheDocument();
  });
});
