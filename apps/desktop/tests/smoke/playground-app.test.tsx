import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaygroundApp } from "@/playground/browser/playground-app";
import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

describe("PlaygroundApp", () => {
  beforeEach(() => {
    resetPlaygroundHash();
  });

  function resetPlaygroundHash() {
    window.history.replaceState(null, "", "/");
  }

  function renderPlayground() {
    resetPlaygroundHash();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    render(<PlaygroundApp />);
  }

  function selectView(name: string) {
    fireEvent.click(screen.getByRole("tab", { name }));
  }

  function petStatusList() {
    const heading = screen.getByRole("heading", {
      name: PLAYGROUND_TEXT.petStatusTitle,
    });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    return within(section as HTMLElement);
  }

  it("renders the simulation canvas shell", () => {
    renderPlayground();

    expect(
      screen.getByRole("heading", { name: PLAYGROUND_TEXT.title }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: PLAYGROUND_TEXT.behaviorLabTitle }),
    ).toBeInTheDocument();
  });

  it("renders simulation playgrounds from the unified grouped tab shell", () => {
    renderPlayground();

    expect(screen.getByRole("tablist", { name: "Simulation playgrounds" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Prototype playgrounds" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Demo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Design" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Behavior" })).not.toBeInTheDocument();

    selectView("Jump");
    expect(screen.getByRole("heading", { name: "Jump playground" })).toBeInTheDocument();
    expect(screen.getByTestId("jump-world-canvas")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Gwen")).toBeInTheDocument();

    selectView("Climb");
    expect(screen.getByRole("heading", { name: "Climb playground" })).toBeInTheDocument();
    expect(screen.getByTestId("climb-world-canvas")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Eve")).toBeInTheDocument();

    selectView("Decision");
    expect(screen.getByRole("heading", { name: "Decision system" })).toBeInTheDocument();
    expect(screen.getByTestId("decision-showcase-stage")).toBeInTheDocument();
  });

  it("defaults removed prototype hashes to demo and updates the hash when tabs change", () => {
    window.history.replaceState(null, "", "/playground.html#behavior");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(screen.getByRole("tab", { name: "Demo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();

    selectView("Climb");

    expect(window.location.hash).toBe("#climb");
    expect(screen.getByRole("tab", { name: "Climb" })).toHaveAttribute("aria-selected", "true");
  });

  it("remounts playground views when switching tabs", () => {
    renderPlayground();

    selectView("Jump");
    fireEvent.click(screen.getByRole("button", { name: "Pause animation" }));
    fireEvent.click(screen.getByRole("button", { name: "Play next frame" }));
    expect(screen.getByText("Frame: 1")).toBeInTheDocument();

    selectView("Climb");
    selectView("Jump");

    expect(screen.getByText("Frame: 0")).toBeInTheDocument();
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

  it("renders agent hook sample controls without demo or timeline controls", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(
      screen.getByRole("region", { name: PLAYGROUND_TEXT.agentEventPanelTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prompt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Failed" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Walk Alice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Action timeline" }),
    ).not.toBeInTheDocument();
  });

  it("routes sample Claude hooks through the adapter into the playground panel", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: "Failed" }));

    expect(screen.getByText("PostToolUseFailure")).toBeInTheDocument();
    expect(screen.getByText(/"type": "task.failed"/)).toBeInTheDocument();
    expect(screen.getByText(/"sourceId": "agent-a"/)).toBeInTheDocument();
  });

  it("accepts future Tauri bridge events through a browser custom event", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent(
      window,
      new CustomEvent("pets-driven:agent-event", {
        detail: {
          type: "task.waiting",
          sourceId: "agent-a",
          at: 10,
          summary: "Approve this",
        },
      }),
    );

    expect(screen.getByText(/"type": "task.waiting"/)).toBeInTheDocument();
    expect(screen.getByText(/"summary": "Approve this"/)).toBeInTheDocument();
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

  it("can switch the playground into a dual-monitor verification scenario", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        restore: vi.fn(),
        save: vi.fn(),
        translate: vi.fn(),
      } as unknown as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: "Dual monitor" }));

    const canvas = screen.getByTestId("world-canvas");
    expect(canvas).toHaveAttribute("width", "1600");
    expect(canvas).toHaveAttribute("height", "540");
    expect(screen.getByText("Dual monitor: left + primary")).toBeInTheDocument();
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

  it("runs the decision showcase with agent and collision stimuli", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    renderPlayground();
    selectView("Decision");

    fireEvent.click(screen.getByRole("button", { name: "Task failed" }));

    expect(screen.queryByLabelText(/Pet .* overlay/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("decision-agent-pulse")).not.toBeInTheDocument();
    expect(screen.getByTestId("decision-pet-stage")).toHaveAttribute(
      "data-pet-animation-state",
      "failed",
    );
    expect(screen.queryByTestId("decision-selection-slot")).not.toBeInTheDocument();
    for (const label of [
      "Stimulus",
      "Priority claim",
      "Decision token",
      "Planning result",
      "Presentation",
      "Decision trace",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Needs input" }));
    expect(screen.getByTestId("decision-pet-stage")).toHaveAttribute(
      "data-pet-animation-state",
      "waiting",
    );
    expect(screen.queryByTestId("decision-selection-slot")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Task completed" }));
    expect(screen.getByTestId("decision-pet-stage")).toHaveAttribute(
      "data-pet-animation-state",
      "review",
    );
    expect(screen.queryByTestId("decision-selection-slot")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collision" }));
    expect(screen.getByTestId("decision-selection-reel")).toHaveAttribute(
      "data-stop-kind",
      expect.stringMatching(/^collision-/),
    );

    fireEvent.click(screen.getByRole("button", { name: "Autonomous roll" }));

    const stage = within(screen.getByTestId("decision-showcase-stage"));
    expect(stage.getByText(/Alice · /)).toBeInTheDocument();
    expect(stage.queryByText("Softmax roll")).not.toBeInTheDocument();
    expect(stage.queryByText("Random roll")).not.toBeInTheDocument();
    expect(stage.queryByText("Personality")).not.toBeInTheDocument();
    for (const axis of ["O", "C", "E", "A", "N"]) {
      expect(stage.queryByText(axis)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId("decision-roll-marker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("decision-softmax-roll")).not.toBeInTheDocument();
    expect(screen.queryByTestId("decision-selection-overlay")).not.toBeInTheDocument();
    const petStage = screen.getByTestId("decision-pet-stage");
    expect(within(petStage).queryByTestId("decision-selection-slot")).not.toBeInTheDocument();
    const slot = screen.getByTestId("decision-selection-slot");
    expect(slot).toHaveAttribute("data-mode", "slot-machine");
    expect(slot).toHaveAttribute("data-motion-sequence");
    expect(slot).not.toHaveAttribute("data-prototype-variant");
    expect(screen.getByTestId("decision-showcase-stage")).not.toHaveAttribute(
      "data-prototype-variant",
    );
    expect(screen.queryByLabelText("Decision HUD prototype variants")).not.toBeInTheDocument();
    expect(slot).not.toHaveTextContent("winner");
    const reel = screen.getByTestId("decision-selection-reel");
    expect(reel).toHaveAttribute("data-animation", "infinite-to-stop");
    expect(reel).toHaveAttribute("data-spin-profile", "exponential");
    expect(reel).toHaveAttribute("data-spin-ms", "3200");
    expect(reel).toHaveAttribute("data-stop-ms", "1400");
    expect(reel).toHaveAttribute("data-spin-phase", "preview");
    expect(reel).toHaveAttribute("data-stop-kind");
    const reelItems = within(slot).getAllByTestId("decision-selection-reel-item");
    expect(reelItems.length).toBeGreaterThan(1);
    expect(reelItems[0]).toHaveAttribute("data-slot-index", "0");
    expect(slot.querySelectorAll('[data-reel-copy="true"]').length).toBeGreaterThan(0);
    expect(slot.querySelector('[data-slot-stop="center"]')).toBeInTheDocument();
    expect(slot.querySelector('[data-selected="true"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collision" }));

    expect(screen.getByTestId("decision-showcase-stage")).toHaveAttribute(
      "data-motion",
      "collision",
    );
    expect(screen.getByTestId("decision-collider-sprite")).toBeInTheDocument();
    expect(screen.getByTestId("decision-impact-effect")).toBeInTheDocument();
    expect(screen.getByTestId("decision-selection-slot")).toBeInTheDocument();
    expect(screen.getByTestId("decision-selection-reel")).toHaveAttribute(
      "data-stop-kind",
      expect.stringMatching(/^collision-/),
    );
    expect(screen.queryByText("pet collision")).not.toBeInTheDocument();
    expect(screen.queryByText("deliberating")).not.toBeInTheDocument();

    const firstMotionSequence = screen
      .getByTestId("decision-showcase-stage")
      .getAttribute("data-motion-sequence");
    fireEvent.click(screen.getByRole("button", { name: "Collision" }));
    expect(
      screen.getByTestId("decision-showcase-stage").getAttribute("data-motion-sequence"),
    ).not.toBe(firstMotionSequence);
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
