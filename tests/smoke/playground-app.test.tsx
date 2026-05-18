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

  it("accepts a waiting stimulus from the controls", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingStimulus }));

    expect(screen.getByText(`${PLAYGROUND_TEXT.lastStimulusPrefix} task.waiting`)).toBeInTheDocument();
  });
});
