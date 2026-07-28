import {
  CARRIED_ITEM_WARNING_SECONDS,
  carriedItemCountdown,
} from "@pets-driven/pet-engine/features/items/item-presentation";
import { describe, expect, it } from "vitest";

describe("carried item countdown", () => {
  const carried = { pickedUpAt: 10_000, expiresAt: 70_000 };

  it("reports the whole grant at the moment of pickup", () => {
    expect(carriedItemCountdown(carried, 10_000)).toEqual({
      remainingSeconds: 60,
      totalSeconds: 60,
    });
  });

  it("rounds a part-second up, so the last second still reads as time left", () => {
    // A pet with 200ms of flight left is still flying; a countdown reading 0
    // while the wings are on would have the user watching for a drop that has
    // already been announced.
    expect(carriedItemCountdown(carried, 69_800).remainingSeconds).toBe(1);
  });

  it("reaches zero exactly when the ability does", () => {
    expect(carriedItemCountdown(carried, 70_000).remainingSeconds).toBe(0);
  });

  it("never goes negative once the revoke has been missed by a tick", () => {
    expect(carriedItemCountdown(carried, 90_000).remainingSeconds).toBe(0);
  });

  it("keeps the total at one for a grant shorter than a second", () => {
    // A scenario may tune abilityDurationMs below 1000; hosts divide by the
    // total for a progress sweep, so a zero here would put NaN on screen.
    expect(carriedItemCountdown({ pickedUpAt: 0, expiresAt: 400 }, 0).totalSeconds).toBe(1);
  });

  it("leaves room inside the default grant for the warning threshold", () => {
    // The host turns the badge to its warning tone at this reading. If it were
    // ever above the grant itself, every pickup would show up already warning.
    expect(CARRIED_ITEM_WARNING_SECONDS).toBeLessThan(
      carriedItemCountdown(carried, carried.pickedUpAt).totalSeconds,
    );
  });
});
