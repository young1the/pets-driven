import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClimbPlaygroundApp } from "@/playground/browser/climb-playground-app";

describe("ClimbPlaygroundApp", () => {
  it("renders a climb-only canvas with several climbing pets", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<ClimbPlaygroundApp />);

    expect(
      screen.getByRole("heading", { name: "Climb playground" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("climb-world-canvas")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Eve")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Behavior lab" })).not.toBeInTheDocument();
  });
});
