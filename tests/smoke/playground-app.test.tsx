import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaygroundApp } from "../../src/playground/browser/playground-app";

describe("PlaygroundApp", () => {
  it("renders the simulation canvas shell", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    expect(screen.getByRole("heading", { name: "pets-driven playground" })).toBeInTheDocument();
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
  });

  it("accepts a waiting stimulus from the controls", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: "Send waiting stimulus" }));

    expect(screen.getByText("Last stimulus: task.waiting")).toBeInTheDocument();
  });
});
