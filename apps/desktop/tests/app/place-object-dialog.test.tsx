import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaceObjectDialog } from "@/app/main-window/place-object-dialog";

/**
 * The place dialog is the only way into the world for a non-pet entity, so what
 * it must never do is accept a click that goes nowhere. Both of those cases are
 * real: a drop needs a floor, and there is no floor until a pet is on the
 * desktop; and "clear" is meaningless with nothing out there to clear.
 */

function setup(overrides: Partial<Parameters<typeof PlaceObjectDialog>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    counts: { treats: 0, props: 0 },
    onPlaceTreat: vi.fn(),
    onPlaceBall: vi.fn(),
    onClearProps: vi.fn(),
    canPlace: true,
    ...overrides,
  };
  render(<PlaceObjectDialog {...props} />);
  return props;
}

/** The place buttons, in row order: treat first, then ball. */
function placeButtons() {
  return screen.getAllByRole("button", { name: "Place" });
}

describe("PlaceObjectDialog", () => {
  it("places a treat and a ball through their own rows", () => {
    const props = setup();
    const [treat, ball] = placeButtons();

    fireEvent.click(treat);
    fireEvent.click(ball);

    expect(props.onPlaceTreat).toHaveBeenCalledTimes(1);
    expect(props.onPlaceBall).toHaveBeenCalledTimes(1);
  });

  it("refuses to place anything while no pet is on the desktop", () => {
    setup({ canPlace: false });

    for (const button of placeButtons()) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText(/Send a pet to the desktop first/)).toBeInTheDocument();
  });

  it("only offers to clear props once there are some", () => {
    setup();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });

  it("clears the props it says are out there", () => {
    const props = setup({ counts: { treats: 0, props: 2 } });

    expect(screen.getByText("2 on the desktop")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(props.onClearProps).toHaveBeenCalledTimes(1);
  });

  it("says nothing about a count of zero", () => {
    setup();
    // Anchored on the leading number, so the dialog's own title ("Place on the
    // desktop") does not read as a count line.
    expect(screen.queryByText(/^\d+ on the desktop$/)).not.toBeInTheDocument();
  });
});
