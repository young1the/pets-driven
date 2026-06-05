import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JumpPlaygroundApp } from "@/playground/browser/jump-playground-app";

describe("JumpPlaygroundApp", () => {
  it("renders a jump-only canvas with several jumping pets", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );

    render(<JumpPlaygroundApp />);

    expect(
      screen.getByRole("heading", { name: "Jump playground" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("jump-world-canvas")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Gwen")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Behavior lab" })).not.toBeInTheDocument();
  });
});
