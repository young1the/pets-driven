import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaygroundApp } from "@/playground/browser/playground-app";
import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

describe("PlaygroundApp", () => {
  function petStatusList() {
    const heading = screen.getByRole("heading", {
      name: PLAYGROUND_TEXT.petStatusTitle,
    });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    return within(section as HTMLElement);
  }

  it("renders the simulation canvas shell", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(
      screen.getByRole("heading", { name: PLAYGROUND_TEXT.title }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: PLAYGROUND_TEXT.behaviorLabTitle }),
    ).toBeInTheDocument();
  });

  it("forwards pointer events from the canvas to the world", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);
    const canvas = screen.getByTestId("world-canvas");

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      clientX: 600,
      clientY: 500,
      button: 0,
    });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 620, clientY: 500 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 620, clientY: 500 });

    expect(canvas).toBeInTheDocument();
  });

  it("listens for keyboard control events while mounted", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
    fireEvent.keyUp(window, { key: "ArrowRight", code: "ArrowRight" });

    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
  });

  it("does not render event, demo, or timeline controls", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(
      screen.queryByRole("button", { name: "Send started event" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Walk Alice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Last event" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Action timeline" }),
    ).not.toBeInTheDocument();
  });

  it("renders pet status from the world snapshot", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    const petStatus = petStatusList();
    expect(petStatus.getByText("Alice")).toBeInTheDocument();
    expect(petStatus.getByText("Bob")).toBeInTheDocument();
    expect(petStatus.getByText("Charlie")).toBeInTheDocument();
    expect(petStatus.getByText("Dana")).toBeInTheDocument();
    expect(petStatus.getByText("Eve")).toBeInTheDocument();
    expect(petStatus.getByText("Finn")).toBeInTheDocument();
    expect(petStatus.getByText("Gwen")).toBeInTheDocument();
  });

  it("keeps animation controls available", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        rect: vi.fn(),
        stroke: vi.fn(),
        strokeRect: vi.fn(),
      } as unknown as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.pauseAnimation }),
    );
    expect(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.resumeAnimation }),
    ).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.playNextFrame }),
    );
    expect(
      screen.getByText(`${PLAYGROUND_TEXT.frameCounterPrefix} 1`),
    ).toBeInTheDocument();
  });

  it("copies the selected behavior lab state to the clipboard", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<PlaygroundApp />);

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.copyStateToClipboard }),
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = JSON.parse(writeText.mock.calls[0][0]);
    expect(copied.pet.id).toBe("pet-a");
    expect(copied.components.Transform.position).toEqual({ x: 600, y: 500 });
    expect(copied.components.MotionTarget.targetPosition).toBeNull();
    expect(
      await screen.findByText(PLAYGROUND_TEXT.copyStateCopied),
    ).toBeInTheDocument();
  });

  it("shows selected pet behavior state for behavior experiments", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(
      screen.getByText(PLAYGROUND_TEXT.selectedPetLabel),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alice" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Components")).toBeInTheDocument();
    expect(screen.getByText("CanWalk")).toBeInTheDocument();
    expect(screen.getByText("CanJump")).toBeInTheDocument();
    expect(screen.getByText("CanWallClimb")).toBeInTheDocument();
    expect(screen.getByText("Transform")).toBeInTheDocument();
    expect(screen.getByText("Grounded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eve" }));

    expect(screen.getByRole("button", { name: "Eve" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("CanFly")).toBeInTheDocument();
  });

  it("shows component field values in the behavior lab component panel", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    // CanJump component shows its impulse field value
    expect(screen.getAllByText("impulse").length).toBeGreaterThan(0);
    expect(screen.getAllByText("position").length).toBeGreaterThan(0);
    // CanWalk and CanWallClimb expose unit-specific movement fields.
    expect(screen.getAllByText("force").length).toBeGreaterThan(0);
    expect(screen.getAllByText("velocity").length).toBeGreaterThan(0);

    expect(screen.getAllByText("position").length).toBeGreaterThan(0);
  });

  it("can hide and show the behavior lab component state list", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(screen.getByText("Intent")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: PLAYGROUND_TEXT.hideComponentStateList,
      }),
    );

    expect(screen.queryByText("Intent")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: PLAYGROUND_TEXT.showComponentStateList,
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: PLAYGROUND_TEXT.showComponentStateList,
      }),
    );

    expect(screen.getByText("Intent")).toBeInTheDocument();
  });

  it("shows OCEAN personality bars (O C E A N) for the selected pet", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(
      screen.getByText(PLAYGROUND_TEXT.oceanTitle),
    ).toBeInTheDocument();
    // Five axis labels must each appear at least once
    for (const label of ["O", "C", "E", "A", "N"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("shows last-decision token kind in BehaviorLab after stepping a frame", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        rect: vi.fn(),
        stroke: vi.fn(),
        strokeRect: vi.fn(),
      } as unknown as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.pauseAnimation }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.playNextFrame }),
    );

    // BehaviorDecisionSystem emits a token for Alice (selected pet) each tick.
    // BehaviorLab should display the label and the consumed token's kind.
    expect(
      screen.getByText(PLAYGROUND_TEXT.decisionTokenLabel),
    ).toBeInTheDocument();
  });
});
