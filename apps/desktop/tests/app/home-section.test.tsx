import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeSection } from "@/app/main-window/home-section";

const pet = {
  id: "otto",
  name: "Otto",
  assetId: "patamon",
  role: "Steady",
  status: {
    label: "Idle",
    tone: "neutral" as const,
    dotColor: "var(--ink-300)",
  },
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
};

describe("HomeSection", () => {
  it("renders the greeting and a card per at-home pet", () => {
    render(
      <HomeSection
        atHome={[pet]}
        inField={[]}
        onDeploy={vi.fn()}
        onRecall={vi.fn()}
        onEdit={vi.fn()}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    expect(screen.getByText("Otto")).toBeInTheDocument();
    expect(screen.getByText("Steady")).toBeInTheDocument();
  });

  it("keeps the add-pet button from shrinking on narrow layouts", () => {
    render(
      <HomeSection
        atHome={[pet]}
        inField={[]}
        onDeploy={vi.fn()}
        onRecall={vi.fn()}
        onEdit={vi.fn()}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Add a pet",
      }),
    ).toHaveClass("pd-home__add-pet");
  });

  it("deploys a pet when its card is clicked", () => {
    const onDeploy = vi.fn();
    render(
      <HomeSection
        atHome={[pet]}
        inField={[]}
        onDeploy={onDeploy}
        onRecall={vi.fn()}
        onEdit={vi.fn()}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Otto"));
    expect(onDeploy).toHaveBeenCalledWith("otto");
  });

  it("recalls a pet when its field chip is clicked", () => {
    const onRecall = vi.fn();
    render(
      <HomeSection
        atHome={[]}
        inField={[{ id: "mochi", name: "Mochi", color: "#FF6FAB" }]}
        onDeploy={vi.fn()}
        onRecall={onRecall}
        onEdit={vi.fn()}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Mochi"));
    expect(onRecall).toHaveBeenCalledWith("mochi");
  });
});
