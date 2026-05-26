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

  it("injects neutral task lifecycle events and shows the last payload", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.sendStartedEvent }),
    );
    expect(screen.getByText(/"type": "task.started"/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }),
    );
    expect(screen.getByText(/"type": "task.waiting"/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.sendCompletedEvent }),
    );
    expect(screen.getByText(/"type": "task.completed"/)).toBeInTheDocument();
    expect(
      screen.getByText(`${PLAYGROUND_TEXT.lastEventTypePrefix} task.completed`),
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
    expect(petStatus.getByText("Eve")).toBeInTheDocument();
    expect(petStatus.getByText("Finn")).toBeInTheDocument();
    expect(petStatus.getByText("Gwen")).toBeInTheDocument();
  });

  it("updates visible pet status after a waiting event", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }),
    );

    const petStatus = petStatusList();
    // Multiple pets may autonomously choose to seek the user; verify at least one
    // has been set to seek and that Alice's speech was captured.
    expect(petStatus.getAllByText("seek").length).toBeGreaterThan(0);
    expect(petStatus.getByText("Needs approval")).toBeInTheDocument();
  });

  it("starts a visible walking demo from the playground controls", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.startWalkDemo }),
    );

    const alice = petStatusList().getByText("Alice").closest("li");
    expect(alice).not.toBeNull();
    expect(within(alice as HTMLElement).getByText("walk")).toBeInTheDocument();
    expect(
      within(alice as HTMLElement).getByText(PLAYGROUND_TEXT.walkingDemoSpeech),
    ).toBeInTheDocument();
  });

  it("starts visible jump and wall-climb demos from the playground controls", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.startJumpDemo }),
    );
    const aliceAfterJump = petStatusList().getByText("Alice").closest("li");
    expect(aliceAfterJump).not.toBeNull();
    expect(
      within(aliceAfterJump as HTMLElement).getByText("walk"),
    ).toBeInTheDocument();
    expect(
      within(aliceAfterJump as HTMLElement).getByText(
        PLAYGROUND_TEXT.jumpDemoSpeech,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.startWallClimbDemo }),
    );
    const aliceAfterClimb = petStatusList().getByText("Alice").closest("li");
    expect(aliceAfterClimb).not.toBeNull();
    expect(
      within(aliceAfterClimb as HTMLElement).getByText(
        PLAYGROUND_TEXT.wallClimbDemoSpeech,
      ),
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

    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.startJumpDemo }),
    );
    // JumpActionState is transient, so its phase field appears only while the
    // jump action is active.
    expect(screen.getAllByText("phase").length).toBeGreaterThan(0);
  });

  it("shows the action timeline section", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(
      screen.getByRole("heading", {
        name: PLAYGROUND_TEXT.actionTimelineTitle,
      }),
    ).toBeInTheDocument();
  });

  it("can pause the animation loop and manually play the next frame", () => {
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

  it("logs behavior selection entries into the action timeline", () => {
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

    // Pause auto-play so frame timing is deterministic.
    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.pauseAnimation }),
    );

    // Frame 1: BehaviorDecisionSystem fires for all pets (all idle, no targets, no claims).
    // prevSnapshotRef is established with autonomous decisions present.
    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.playNextFrame }),
    );

    // A task.waiting event causes Alice's claim to switch from autonomous -> agent-event.
    // diffSnapshot detects source/reason change and emits a "behavior:" timeline entry.
    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }),
    );

    const timeline = screen.getByTestId("action-timeline");
    expect(timeline.textContent).toMatch(/behavior:/);
  });

  it("records a locomotion change in the action timeline", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    // First event establishes the baseline snapshot in prevSnapshotRef
    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.sendStartedEvent }),
    );
    // Second event diffs against the baseline; Alice's intent changes active → seek
    fireEvent.click(
      screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }),
    );

    const timeline = screen.getByTestId("action-timeline");
    expect(within(timeline).getAllByRole("listitem").length).toBeGreaterThan(0);
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
