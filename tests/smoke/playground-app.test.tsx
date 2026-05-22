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

    expect(screen.getByRole("heading", { name: PLAYGROUND_TEXT.title })).toBeInTheDocument();
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: PLAYGROUND_TEXT.behaviorLabTitle }),
    ).toBeInTheDocument();
  });

  it("injects neutral task lifecycle events and shows the last payload", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendStartedEvent }));
    expect(screen.getByText(/"type": "task.started"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }));
    expect(screen.getByText(/"type": "task.waiting"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendCompletedEvent }));
    expect(screen.getByText(/"type": "task.completed"/)).toBeInTheDocument();
    expect(
      screen.getByText(`${PLAYGROUND_TEXT.lastStimulusPrefix} task.completed`),
    ).toBeInTheDocument();
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
  });

  it("updates visible pet status after a waiting event", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }));

    const petStatus = petStatusList();
    expect(petStatus.getByText("seek")).toBeInTheDocument();
    expect(petStatus.getByText("Needs approval")).toBeInTheDocument();
  });

  it("starts a visible walking demo from the playground controls", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.startWalkDemo }));

    const alice = petStatusList().getByText("Alice").closest("li");
    expect(alice).not.toBeNull();
    expect(within(alice as HTMLElement).getByText("walk")).toBeInTheDocument();
    expect(within(alice as HTMLElement).getByText(PLAYGROUND_TEXT.walkingDemoSpeech)).toBeInTheDocument();
  });

  it("starts visible jump and wall-climb demos from the playground controls", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.startJumpDemo }));
    const aliceAfterJump = petStatusList().getByText("Alice").closest("li");
    expect(aliceAfterJump).not.toBeNull();
    expect(within(aliceAfterJump as HTMLElement).getByText("walk")).toBeInTheDocument();
    expect(within(aliceAfterJump as HTMLElement).getByText(PLAYGROUND_TEXT.jumpDemoSpeech)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.startWallClimbDemo }));
    const aliceAfterClimb = petStatusList().getByText("Alice").closest("li");
    expect(aliceAfterClimb).not.toBeNull();
    expect(within(aliceAfterClimb as HTMLElement).getByText(PLAYGROUND_TEXT.wallClimbDemoSpeech)).toBeInTheDocument();
  });

  it("shows selected pet behavior state for behavior experiments", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(screen.getByText(PLAYGROUND_TEXT.selectedPetLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alice" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Components")).toBeInTheDocument();
    expect(screen.getByText("CanWalk")).toBeInTheDocument();
    expect(screen.getByText("CanJump")).toBeInTheDocument();
    expect(screen.getByText("CanWallClimb")).toBeInTheDocument();
    expect(screen.getByText("Grounded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dana" }));

    expect(screen.getByRole("button", { name: "Dana" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("CanFly")).toBeInTheDocument();
  });
});
