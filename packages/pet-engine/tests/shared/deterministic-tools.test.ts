import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

describe("deterministic helpers", () => {
  it("advances a manual clock explicitly", () => {
    const clock = createManualClock(1_000);

    clock.advanceBy(250);

    expect(clock.now()).toBe(1_250);
  });

  it("replays the same random sequence from the same seed", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);

    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });
});
