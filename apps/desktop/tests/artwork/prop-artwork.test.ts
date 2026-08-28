import { describe, expect, it } from "vitest";
import {
  BALL_ART_BODY_SPAN,
  BALL_ART_SIZE,
  ballArtDataUri,
  ballArtSvg,
  rollRotation,
} from "@/artwork/prop-artwork";

/**
 * The ball's drawing, and the one piece of arithmetic behind its roll.
 *
 * The roll is worth pinning down because the surface that uses it reads
 * `window.screenX` inside an animation frame, which no test can drive — so the
 * only part that can be checked is that the maths is rolling-without-slipping
 * and not something that merely looks like it.
 */

describe("rollRotation", () => {
  it("turns a ball one radian for every radius it travels", () => {
    expect(rollRotation(0, 26, 26)).toBeCloseTo(1);
    expect(rollRotation(0, 52, 26)).toBeCloseTo(2);
  });

  it("accumulates, so a roll is continuous across frames", () => {
    let angle = 0;
    for (let i = 0; i < 10; i += 1) angle = rollRotation(angle, 2.6, 26);
    expect(angle).toBeCloseTo(1);
  });

  it("turns backwards when the ball travels backwards", () => {
    expect(rollRotation(1, -26, 26)).toBeCloseTo(0);
  });

  it("leaves the angle alone rather than dividing by a zero radius", () => {
    expect(rollRotation(1.5, 10, 0)).toBe(1.5);
  });
});

describe("ballArtSvg", () => {
  it("draws inside its box, so a rolling ball never clips its own window", () => {
    expect(BALL_ART_BODY_SPAN).toBeLessThan(BALL_ART_SIZE);
  });

  it("carries the design tokens rather than hard-coded colour", () => {
    // ink[950], the panel colour. A drawing that stopped reading tokens would
    // drift away from the rest of the app silently.
    expect(ballArtSvg()).toContain("#221F2E");
  });

  it("survives the trip through a data URI", () => {
    const uri = ballArtDataUri();
    expect(uri.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(decodeURIComponent(uri.slice("data:image/svg+xml;utf8,".length))).toBe(ballArtSvg());
  });
});
