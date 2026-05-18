import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaygroundApp } from "@/playground/browser/playground-app";
import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

describe("PlaygroundApp", () => {
  it("renders the simulation canvas shell", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(screen.getByRole("heading", { name: PLAYGROUND_TEXT.title })).toBeInTheDocument();
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
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
});
