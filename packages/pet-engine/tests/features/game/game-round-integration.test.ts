import { createAdoptedPetsScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { GAME_SESSION_ENTITY_ID } from "@pets-driven/pet-engine/features/game/components";
import { describe, expect, it } from "vitest";

/**
 * A whole round in a real world, not a hand-built store.
 *
 * The unit tests each hold one system still and poke it; this is the only place
 * that answers whether a round actually gets anywhere once every system in the
 * pipeline is running against it.
 */
function runRound(ticks: number, petBodySize?: { width: number; height: number }) {
  const scenario = createAdoptedPetsScenario(
    [{ id: "pet-a", sourceId: "agent-a", name: "Scout" }],
    petBodySize ? { petBodySize } : undefined,
  );

  scenario.world.startGame("pet-a", { spawn: "auto" });

  const seen: string[] = [];
  const seenPropKinds = new Set<string>();
  for (let i = 0; i < ticks; i += 1) {
    scenario.clock.advanceBy(16);
    scenario.world.step(16);

    for (const prop of scenario.world.snapshot().props) seenPropKinds.add(prop.kind);
    const session = scenario.world.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
    if (session) seen.push(session.phase);
  }

  return { scenario: { ...scenario, seenPropKinds: [...seenPropKinds] }, seen };
}

describe("a practice round, end to end", () => {
  it("leaves the countdown and starts running", () => {
    const { seen } = runRound(260);

    expect(seen[0]).toBe("countdown");
    expect(seen).toContain("running");
  });

  it("lays obstacles once it is running", () => {
    const { scenario } = runRound(360);

    expect(scenario.world.snapshot().props.length).toBeGreaterThan(0);
  });

  it("keeps the round going rather than stopping on its own", () => {
    const { scenario, seen } = runRound(600);

    const session = scenario.world.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
    expect(seen.filter((phase) => phase === "running").length).toBeGreaterThan(100);
    expect(session?.score).toBeGreaterThan(0);
  });
});

describe("a round that can actually be run", () => {
  it("clears obstacle after obstacle instead of dying on the second one", () => {
    const { scenario, seen } = runRound(4_000);

    // The spacing has to leave room for the jump *and* the landing cooldown
    // after it. When it did not, every round ended on its second hurdle however
    // well it was played — the pet was still on the floor, unable to jump.
    const session = scenario.world.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
    expect(seen).not.toContain("over");
    expect(session?.phase).toBe("running");
  });

  it("takes its scenery away when the user stops it", () => {
    const { scenario } = runRound(600);
    expect(scenario.world.snapshot().props.length).toBeGreaterThan(0);

    scenario.world.endGame();
    scenario.clock.advanceBy(16);
    scenario.world.step(16);

    // Every obstacle is a real always-on-top window. Stopping the round used to
    // null the session's pet, which is exactly the thing the sweep needed to
    // run — so the course froze where it stood and stayed on the desktop.
    expect(scenario.world.snapshot().props).toHaveLength(0);
  });

  it("lays all three hurdles, not the same one over and over", () => {
    const { scenario } = runRound(6_000);

    // A course of identical obstacles is one question asked over and over. The
    // two big ones are the same cactus doubled — twice as tall, or twice as
    // wide — so one asks for a higher jump and the other for a longer one.
    expect(new Set(scenario.seenPropKinds)).toEqual(
      new Set(["hurdle", "hurdle-tall", "hurdle-wide"]),
    );
  });

  it("counts what it got over", () => {
    const { scenario } = runRound(4_000);

    // The tally is the round's only quality score and the only thing the pet
    // wears while it runs. A round that clears obstacle after obstacle and
    // reports nothing is the round with no indicators the user was given.
    const session = scenario.world.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
    expect(session?.cleared).toBeGreaterThan(5);
  });

  // Every size the resize handle allows, because the round used to be
  // arithmetically impossible above about 1.2 and nothing said so. A jump is
  // mass-compensated and so rises the same height whatever size a pet is drawn
  // at, but the obstacle has to cross the pet's *width* — which is not — so a
  // full-size pet spent 53 ticks inside a hurdle it had 27 ticks of clearance
  // for. Every round ended on the first one.
  //
  // Long enough for the practice bag to deal every hurdle, the tall one
  // included: it broke this again the moment it was added, and at the largest
  // size only (see GAME_HANG_GRAVITY_SCALE).
  it.each([
    ["half size, the size a pet is adopted at", 78],
    ["full size", 156],
    ["scaled up", 234],
    ["the largest the resize handle allows", 312],
  ])("is survivable at %s", (_label, side) => {
    const { scenario, seen } = runRound(6_000, { width: side, height: side });

    const session = scenario.world.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
    expect(scenario.seenPropKinds).toContain("hurdle-tall");
    expect(seen).not.toContain("over");
    expect(session?.cleared).toBeGreaterThan(5);
  });
});

describe("a round the pet loses", () => {
  /**
   * Nobody driving and nobody flying it: `control: "user"` hands the keyboard
   * the pet, which silences the pilot, and no key is ever pressed. So the pet
   * stands there and the first obstacle takes it — which is the only way to see
   * a lost round end to end, now that a played one is survivable at every size.
   */
  function runLostRound(ticks: number) {
    const scenario = createAdoptedPetsScenario([
      { id: "pet-a", sourceId: "agent-a", name: "Scout" },
    ]);
    scenario.world.startGame("pet-a", { spawn: "auto", control: "user" });

    const frames: { down: boolean; playing: string; obstacles: number }[] = [];
    for (let i = 0; i < ticks; i += 1) {
      scenario.clock.advanceBy(16);
      scenario.world.step(16);
      const snapshot = scenario.world.snapshot();
      frames.push({
        down: !!scenario.world.getComponent("pet-a", "GameStumble"),
        playing: snapshot.bodies.find((body) => body.id === "pet-a")?.animationState ?? "",
        obstacles: snapshot.props.length,
      });
    }
    return frames;
  }

  it("keeps the pet down the whole time the course it lost to is on screen", () => {
    const frames = runLostRound(600);
    const firstDown = frames.findIndex((frame) => frame.down);

    expect(firstDown).toBeGreaterThan(-1);
    // Every frame from the clip until the course goes: no standing up halfway
    // through and idling beside the cactus that ended the round.
    for (const frame of frames.slice(firstDown)) {
      if (frame.obstacles === 0) break;
      expect(frame.down).toBe(true);
      expect(frame.playing).toBe("failed");
    }
  });

  it("lets it up in the same breath the course goes", () => {
    const frames = runLostRound(600);
    // From the clip, not from the start: a round opens with an empty course
    // too, and that is not the sweep this is about.
    const firstDown = frames.findIndex((frame) => frame.down);
    const swept = frames.findIndex((frame, index) => index > firstDown && frame.obstacles === 0);

    expect(swept).toBeGreaterThan(firstDown);
    expect(frames[swept - 1].down).toBe(true);
    expect(frames[swept].down).toBe(false);
  });
});
