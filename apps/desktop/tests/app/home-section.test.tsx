import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeSection } from "@/app/main-window/home-section";

const pet = {
  id: "otto",
  name: "Otto",
  assetId: "patamon",
  note: "Watch the auth queue",
  role: "Steady",
  status: {
    label: "Idle",
    tone: "neutral" as const,
    dotColor: "var(--ink-300)",
  },
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
  cwd: null,
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
    expect(screen.getByText("Watch the auth queue")).toBeInTheDocument();
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

  it("opens the detail screen when a card is clicked without dragging", () => {
    const onEdit = vi.fn();
    const onDeploy = vi.fn();
    render(
      <HomeSection
        atHome={[pet]}
        inField={[]}
        onDeploy={onDeploy}
        onRecall={vi.fn()}
        onEdit={onEdit}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: "Open Otto's details" });
    fireEvent.pointerDown(card, {
      button: 0,
      clientX: 100,
      clientY: 500,
      pointerId: 1,
    });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 500, pointerId: 1 });

    expect(onEdit).toHaveBeenCalledWith("otto");
    expect(onDeploy).not.toHaveBeenCalled();
  });

  it("deploys a pet when its card is dragged up past the y threshold", () => {
    const onEdit = vi.fn();
    const onDeploy = vi.fn();
    render(
      <HomeSection
        atHome={[pet]}
        inField={[]}
        onDeploy={onDeploy}
        onRecall={vi.fn()}
        onEdit={onEdit}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: "Open Otto's details" });
    fireEvent.pointerDown(card, {
      button: 0,
      clientX: 100,
      clientY: 500,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 350, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 350, pointerId: 1 });

    expect(onDeploy).toHaveBeenCalledWith("otto");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("springs back without deploying when not dragged far enough upward", () => {
    const onEdit = vi.fn();
    const onDeploy = vi.fn();
    render(
      <HomeSection
        atHome={[pet]}
        inField={[]}
        onDeploy={onDeploy}
        onRecall={vi.fn()}
        onEdit={onEdit}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: "Open Otto's details" });
    fireEvent.pointerDown(card, {
      button: 0,
      clientX: 100,
      clientY: 500,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 450, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 450, pointerId: 1 });

    expect(onDeploy).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("does not render the pencil edit button on cards", () => {
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
      screen.queryByRole("button", { name: "Edit pet" }),
    ).not.toBeInTheDocument();
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
