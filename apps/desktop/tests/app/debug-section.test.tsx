import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebugSection } from "@/app/main-window/debug-section";

describe("DebugSection", () => {
  it("runs a grouped action", () => {
    const onClick = vi.fn();
    render(
      <DebugSection
        error={null}
        groups={[
          {
            title: "Pet windows",
            hint: "overlay control",
            items: [{ label: "Reset pets", onClick }],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByText("Reset pets"));
    expect(onClick).toHaveBeenCalled();
  });

  it("shows an error when present", () => {
    render(<DebugSection error="boom" groups={[]} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("shows a copyable diagnostics report when present", () => {
    render(
      <DebugSection
        diagnosticReport={"Pets-Driven Pet Diagnostics\npet-a stalled"}
        error={null}
        groups={[]}
      />,
    );

    expect(screen.getByLabelText("Pet diagnostics report")).toHaveValue(
      "Pets-Driven Pet Diagnostics\npet-a stalled",
    );
  });
});
