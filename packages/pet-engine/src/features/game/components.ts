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
