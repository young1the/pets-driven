/**
 * Game mode: the one pet the user has put on a course, and how it is being run.
 *
 * The slice exists because a pet already knows how to run, jump and be steered
 * — what it has never had is a *reason* framed as a course. Everything here is
 * that framing and nothing else: no locomotion, no physics, no input. Later
 * steps add obstacles (as props, the ball's cousins) and a pilot that asks
 * JumpSystem to jump; both read this session and write nothing a pet does not
 * already understand.
 *
 * Deliberately one session for the whole world rather than a flag per pet.
 * Several pets on a desktop is already a lot to watch, and a game on each of
 * them at once is the version of this feature nobody wants. A singleton that
 * *names* its pet makes "one at a time" the shape of the data instead of a rule
 * someone has to remember — the same way `user-interaction` holds one
 * KeyboardControlTarget rather than stamping every pet with "am I steered".
 */

/** The world-level entity the session lives on, like `user-interaction`. */
export const GAME_SESSION_ENTITY_ID = "game-session";

/**
 * Who is driving, and where the course comes from. Two independent axes: the
 * same course code serves a pet running itself off its agent's tool calls and a
 * user playing a plain arcade round, so neither axis is allowed to imply the
 * other.
 */
export type GameControlSource = "user" | "pet";
export type GameSpawnSource = "auto" | "tool-use";

/**
 * `countdown` is the 3-2-1 before the course starts moving, `running` is the
 * round, `blocked` is a gate the agent has to clear (a waiting task — the game
 * stopping is the report), and `over` ends it.
 */
export type GamePhase = "countdown" | "running" | "blocked" | "over";

export type GameSessionComponent = {
  type: "GameSession";
  /** The pet on the course. Null is the whole of "no game right now". */
  petId: string | null;
  control: GameControlSource;
  spawn: GameSpawnSource;
  phase: GamePhase;
  /** Milliseconds left in the opening countdown; only read while counting. */
  countdownMs: number;
  /**
   * Distance travelled, which in `spawn: "tool-use"` is how long the agent's
   * task has been running. Lives here and nowhere else — nothing writes it to
   * disk and `pdd` never learns it. A score that survives the round turns this
   * into something to be good at, and a round whose length is decided by
   * somebody else's agent is not a thing anyone can be good at.
   */
  score: number;
  startedAt: number;
  /**
   * Where the pet stood when the round began — the middle of its lane, and the
   * line the course is measured from. Held on the session rather than read from
   * the pet each tick, or the lane would drift along with whatever the pet did
   * last.
   */
  anchorX: number;
};

/** How long the opening countdown runs, and therefore how many glyphs it shows. */
export const GAME_COUNTDOWN_MS = 3_000;

/**
 * The countdown as the pet wears it: one glyph a second over its head.
 *
 * Read off the remaining time rather than stepped by a counter so the glyph can
 * never drift from the clock that ends the countdown — there is one source of
 * truth for "how long is left" and the display is a pure function of it.
 */
export function gameCountdownGlyph(countdownMs: number): string | null {
  if (countdownMs <= 0) return null;
  const second = Math.ceil(countdownMs / 1_000);
  if (second >= 3) return "3️⃣";
  if (second === 2) return "2️⃣";
  return "1️⃣";
}

/**
 * A piece of scenery on the course.
 *
 * Rides on a prop rather than being its own kind of thing: an obstacle needs a
 * body that stands on the floor and a window the host already knows how to
 * draw, and `WorldProp` is exactly that. What it must *not* inherit is being a
 * toy, so PropKickSystem skips anything wearing this — a pet does not dribble
 * a hurdle.
 */
export type GameObstacleComponent = {
  type: "GameObstacle";
  spawnedAt: number;
  /** True once the pet has passed it, so one obstacle scores once. */
  cleared: boolean;
};

/** The hurdle's body, in engine pixels. Small enough that the default jump clears it. */
export const HURDLE_SIZE = { width: 26, height: 30 } as const;

/**
 * How fast the course comes at the pet, in engine pixels per 16ms tick.
 *
 * Matches DEFAULT_PET_CONTROL_SPEED on purpose. The pet runs in place and the
 * scenery moves, so this number *is* the pet's running speed — and a round the
 * user has taken the controls of has to feel like the pace they already know
 * from steering a pet by hand.
 */
export const COURSE_SCROLL_SPEED = 3.2;

/** Where an obstacle enters, measured from the pet. Just off the far edge of a look. */
export const COURSE_SPAWN_AHEAD = 460;

/** How far past the pet an obstacle travels before it is taken away. */
export const COURSE_REAP_BEHIND = 140;

/**
 * Obstacles alive at once.
 *
 * A cap rather than a rhythm alone, because in window-per-pet mode every one of
 * these is a real always-on-top window. Four is what the spacing below produces
 * anyway; the cap is what stops a burst of tool calls from opening twenty.
 */
export const MAX_LIVE_OBSTACLES = 4;

/** Gap between obstacles on the `auto` rhythm. Comfortably more than one jump. */
export const COURSE_SPAWN_INTERVAL_MS = 1_400;

/**
 * How far the pet may range from where its round started, in engine pixels.
 *
 * Pinning the pet outright made the round a one-button toy: the only thing a
 * player could do was time a jump, and standing perfectly still while scenery
 * slid past read as a screensaver rather than a game. A lane gives the round
 * its second verb — close on a hurdle to jump it late, or back off and take it
 * early — without letting a held direction key walk the pet clean off the
 * course the way an unbounded run did.
 *
 * Asymmetric on purpose: forward is toward the oncoming course, which is the
 * interesting direction and also the risky one, so there is more of it than
 * there is retreat.
 */
export const COURSE_LANE_FORWARD = 150;
export const COURSE_LANE_BACK = 90;
