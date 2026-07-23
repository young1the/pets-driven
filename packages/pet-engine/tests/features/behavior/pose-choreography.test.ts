import {
  getExpressivePoseState,
  resolveChoreographyBeat,
} from "@pets-driven/pet-engine/features/behavior/pose-choreography";
import { describe, expect, it } from "vitest";

describe("resolveChoreographyBeat", () => {
  const sequence = [
    { state: "waving" as const, durationMs: 100 },
    { state: "idle" as const, durationMs: 200 },
  ];

  it("holds each beat for its duration and loops", () => {
    expect(resolveChoreographyBeat(sequence, 0)).toBe("waving");
    expect(resolveChoreographyBeat(sequence, 99)).toBe("waving");
    expect(resolveChoreographyBeat(sequence, 100)).toBe("idle");
    expect(resolveChoreographyBeat(sequence, 299)).toBe("idle");
    // Wraps back to the opening beat rather than freezing on the last one.
    expect(resolveChoreographyBeat(sequence, 300)).toBe("waving");
    expect(resolveChoreographyBeat(sequence, 400)).toBe("idle");
  });

  it("treats a claim stamped in the future as the opening beat", () => {
    expect(resolveChoreographyBeat(sequence, -50)).toBe("waving");
  });

  it("falls back to the first beat when every duration is degenerate", () => {
    expect(resolveChoreographyBeat([{ state: "review", durationMs: 0 }], 500)).toBe("review");
  });
});

describe("getExpressivePoseState", () => {
  it("returns undefined for a reason that names no pose", () => {
    expect(getExpressivePoseState("wander-near", 0)).toBeUndefined();
  });

  /**
   * The compatibility invariant: a freshly-claimed pose must still show the row
   * it held before choreography existed, so only the continuation is new.
   */
  it.each([
    ["greet", "waving"],
    ["groom", "running"],
    ["observe", "review"],
    ["beckon", "waiting"],
    ["fret", "failed"],
    ["nap", "idle"],
    ["meditate", "review"],
    ["keep-watch", "waiting"],
    ["peek", "review"],
    ["inspect", "review"],
    ["follow-routine", "running"],
    ["offer-comfort", "waving"],
    ["stand-lookout", "failed"],
  ] as const)("opens %s on its original row", (reason, expected) => {
    expect(getExpressivePoseState(reason, 0)).toBe(expected);
  });

  /**
   * The point of the feature: the four poses that share the `review` opening
   * row must stop being the same picture once the pose is actually held.
   */
  it("separates the poses that share the review row within one second", () => {
    const atHalfSecond = ["observe", "meditate", "peek", "inspect"].map((reason) =>
      getExpressivePoseState(reason, 500),
    );

    expect(atHalfSecond).toEqual(["review", "review", "idle", "review"]);

    const atOneSecond = ["observe", "meditate", "peek", "inspect"].map((reason) =>
      getExpressivePoseState(reason, 1_000),
    );

    // observe is mid double-take, meditate has settled, peek is still hidden,
    // inspect has shuffled closer — four distinct rows from one shared row.
    expect(atOneSecond).toEqual(["review", "idle", "review", "review"]);
    expect(getExpressivePoseState("inspect", 700)).toBe("running");
  });

  it("keeps a nap on a single still row for its whole hold", () => {
    for (const elapsed of [0, 600, 1_199, 2_400, 6_000]) {
      expect(getExpressivePoseState("nap", elapsed)).toBe("idle");
    }
  });

  it("gives beckon a wave beat that greet does not share at the same moment", () => {
    // Both are affectionate gestures; the rhythm is what tells them apart.
    expect(getExpressivePoseState("beckon", 700)).toBe("waving");
    expect(getExpressivePoseState("greet", 700)).toBe("idle");
  });

  /**
   * PET-23: releasing a settled task drops the waiting/review row that was
   * pinned by the task hold, so without a pose the pet just stands there. Both
   * acknowledge beats must answer with a wave on their opening frame.
   */
  it.each([
    "acknowledge-waiting",
    "acknowledge-completed",
  ] as const)("opens the %s beat on a wave, not on the status row it just left", (reason) => {
    expect(getExpressivePoseState(reason, 0)).toBe("waving");
  });

  it("gives the two acknowledge beats different rhythms", () => {
    // waiting is a brisk double wave-off; completed is a fuller, prouder sweep.
    // At 400ms the relieved one has already settled while the proud one is
    // still mid-wave, so the two do not read as the same animation.
    expect(getExpressivePoseState("acknowledge-waiting", 400)).toBe("idle");
    expect(getExpressivePoseState("acknowledge-completed", 400)).toBe("waving");
  });

  it("loops the acknowledge beats so they fill the whole 3s claim", () => {
    // acknowledge-waiting is 1440ms long; at 1440 it must be back on the wave
    // rather than frozen on the closing idle.
    expect(getExpressivePoseState("acknowledge-waiting", 1_440)).toBe("waving");
    // acknowledge-completed is 1840ms long.
    expect(getExpressivePoseState("acknowledge-completed", 1_840)).toBe("waving");
  });
});
