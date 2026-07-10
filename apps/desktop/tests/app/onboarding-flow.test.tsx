import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";
import { createEmptyPetsDrivenState } from "@/app-state/pets-driven-state";
import type { DesktopGateway } from "@/app/desktop-gateway";

function createGateway(
  packages: Awaited<ReturnType<DesktopGateway["listPetPackages"]>>,
): DesktopGateway {
  return {
    readPetsDrivenState: vi.fn(),
    writePetsDrivenState: vi.fn(),
    listPetPackages: vi.fn().mockResolvedValue(packages),
    openAdoptedPetWindow: vi.fn(),
    closeAdoptedPetWindow: vi.fn(),
    openPetContextMenu: vi.fn(),
    pickDirectory: vi.fn(),
  };
}

function renderOnboarding(gateway: DesktopGateway) {
  render(
    <OnboardingFlow
      gateway={gateway}
      onDone={vi.fn()}
      onStateChange={vi.fn()}
      state={createEmptyPetsDrivenState()}
    />,
  );

  fireEvent.click(screen.getByText("Get started →"));
}

describe("OnboardingFlow Petdex CTA", () => {
  it("can open directly on the empty Pet Asset selection state", async () => {
    render(
      <OnboardingFlow
        gateway={createGateway([])}
        initialStep="choose"
        onDone={vi.fn()}
        onStateChange={vi.fn()}
        state={createEmptyPetsDrivenState()}
      />,
    );

    expect(
      await screen.findByText("No pet looks installed yet."),
    ).toBeInTheDocument();
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

    const petdexCopy = screen.getByText(
      "Want more looks? Install pets from Petdex.",
    );
    expect(petdexCopy).toBeTruthy();
    expect(
      Boolean(
        petName!.compareDocumentPosition(petdexCopy) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(screen.getByRole("link", { name: "Open Petdex" }).getAttribute("href")).toBe("https://petdex.dev");
  });

  it("shows a Petdex install command when no local pet packs exist", async () => {
    renderOnboarding(createGateway([]));

    await waitFor(() => {
      expect(
        screen.getByText("No pet looks installed yet."),
      ).toBeTruthy();
    });

    expect(screen.getByText("npx petdex install boba")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse Petdex" }).getAttribute("href")).toBe("https://petdex.dev");
  });
});

describe("OnboardingFlow pet source folders", () => {
  it("lets the user choose a Petdex folder from the empty state", async () => {
    const gateway = createGateway([]);
    gateway.pickDirectory = vi.fn().mockResolvedValue("D:\\pets\\mine");
    const onStateChange = vi.fn();

    render(
      <OnboardingFlow
        gateway={gateway}
        onDone={vi.fn()}
        onStateChange={onStateChange}
        state={createEmptyPetsDrivenState()}
      />,
    );
    fireEvent.click(screen.getByText("Get started →"));

    const chooseFolder = await screen.findByText("Choose a Petdex folder");
    fireEvent.click(chooseFolder);

    await waitFor(() => {
      expect(gateway.writePetsDrivenState).toHaveBeenCalledWith(
        expect.objectContaining({
          petSourceDirectories: ["D:\\pets\\mine"],
        }),
      );
    });

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ petSourceDirectories: ["D:\\pets\\mine"] }),
    );
    // The pet-pack roots are rescanned once on mount and again after the
    // folder is added, so the new folder's packs surface immediately.
    expect(gateway.listPetPackages).toHaveBeenCalledTimes(2);
  });
});
