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
    // The command surface answers with the state the backend persisted; null is
    // the outside-Tauri answer, which keeps the caller on its in-memory copy.
    hatchPet: vi.fn().mockResolvedValue(null),
    updatePet: vi.fn().mockResolvedValue(null),
    deletePet: vi.fn().mockResolvedValue(null),
    updateSettings: vi.fn().mockResolvedValue(null),
    resetSettings: vi.fn().mockResolvedValue(null),
    listPetPackages: vi.fn().mockResolvedValue(packages),
    listDesignatedPetPackages: vi.fn().mockResolvedValue([]),
    listTerminalShells: vi.fn().mockResolvedValue([]),
    openAdoptedPetWindow: vi.fn(),
    openAdoptedPetWindows: vi.fn().mockResolvedValue(undefined),
    closeAdoptedPetWindow: vi.fn(),
    openPetContextMenu: vi.fn(),
    pickDirectory: vi.fn(),
    revealPath: vi.fn(),
    listPetSourceDirectoryOptions: vi.fn().mockResolvedValue([]),
    copyBundledPetsToSourceDirectory: vi.fn().mockResolvedValue(0),
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
    getCodexPluginStatus: vi.fn().mockResolvedValue({
      state: "not-installed",
      version: null,
      error: null,
    }),
    planCodexPluginCommand: vi.fn().mockResolvedValue({
      line: "codex plugin add pets-driven@pets-driven",
      status: { state: "not-installed", version: null, error: null },
    }),
    installCodexPlugin: vi.fn().mockResolvedValue({
      state: "installed",
      version: "0.1.0",
      error: null,
    }),
    uninstallCodexPlugin: vi.fn().mockResolvedValue({
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
      lastEventAt: null,
      receivedCount: 0,
      lastEventName: null,
    }),
    sendTestHookEvent: vi.fn().mockResolvedValue("HTTP/1.1 200 OK"),
    closeAllPetWindows: vi.fn().mockResolvedValue(undefined),
    placePetWindows: vi.fn().mockResolvedValue([]),
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
      expect(gateway.updateSettings).toHaveBeenCalledWith({
        petSourceDirectory: "D:\\pets\\mine",
      });
    });

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ petSourceDirectory: "D:\\pets\\mine" }),
    );
    // The pet-pack roots are rescanned once on mount and again after the
    // folder is added, so the new folder's packs surface immediately.
    expect(gateway.listPetPackages).toHaveBeenCalledTimes(2);
  });
});

describe("AdoptPetFlow watch folder", () => {
  // On a first adoption no working directory is registered yet, so the folder
  // list is empty and the OS picker is the only way to choose one. Without it
  // the step offers nothing to click.
  it("picks a watch folder from the empty folder step", async () => {
    const gateway = createGateway([
      {
        id: "boba",
        displayName: "Boba",
        description: "A cozy Petdex pet.",
        spritesheetPath: "boba/spritesheet.webp",
      },
    ]);
    gateway.pickDirectory = vi.fn().mockResolvedValue("D:\\work\\atlas");
    renderOnboarding(gateway);

    fireEvent.click(await screen.findByText("Boba"));
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Looks good →"));

    expect(screen.getByText("Adopt without a folder →")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Choose another folder…"));

    expect(await screen.findByText("D:\\work\\atlas")).toBeInTheDocument();
    expect(screen.getByText("Adopt into this folder →")).toBeInTheDocument();
  });
});

describe("AdoptPetFlow done step", () => {
  // Connecting the agent is the setup wizard's job, not the adoption flow's.
  // The done step celebrates the new pet and gets out of the way.
  it("celebrates the pet without re-offering the agent connection", async () => {
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

    expect(await screen.findByText("Open Pets-Driven →")).toBeInTheDocument();
    expect(screen.queryByText("Connect Claude Code")).not.toBeInTheDocument();
    expect(screen.queryByText("Install")).not.toBeInTheDocument();
    expect(screen.queryByText("Reacts to")).not.toBeInTheDocument();
    expect(gateway.planClaudePluginCommand).not.toHaveBeenCalled();
  });
});
