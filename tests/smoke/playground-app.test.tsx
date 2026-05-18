import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlaygroundApp } from "../../src/playground/browser/playground-app";

describe("PlaygroundApp", () => {
  it("renders the simulation canvas shell", () => {
    render(<PlaygroundApp />);

    expect(screen.getByRole("heading", { name: "pets-driven playground" })).toBeInTheDocument();
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
  });
});
