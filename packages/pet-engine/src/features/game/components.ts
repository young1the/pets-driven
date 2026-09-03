import type { WorldPropKind } from "@pets-driven/pet-engine/features/props/components";

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
  /**
   * Obstacles this round has put behind the pet without touching one.
   *
   * Distance says how long a round lasted; this is the only number that says
   * how well it went, and it is what the pet wears over its head while it runs.
   * A round with no visible tally reads as scenery sliding past rather than as
   * something being played — which is exactly how it read.
   */
  cleared: number;
  startedAt: number;
  /**
   * Where the pet stood when the round began — the middle of its lane, and the
   * line the course is measured from. Held on the session rather than read from
   * the pet each tick, or the lane would drift along with whatever the pet did
   * last.
   */
  anchorX: number;
  /**
   * The agent pulse this round has already turned into scenery. A tool call is
   * a heartbeat that lands on AgentActivitySignal, not an event the course can
   * drain — the agent systems consume the queue first — so the course watches
   * the timestamp move instead.
   */
  lastPulseAt: number;
  /** When the round ended, so its last obstacle can be read before it is swept. */
  endedAt: number;
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

/**
 * Gap between obstacles on the `auto` rhythm.
 *
 * Measured against the jump, not guessed. A pet is off the floor for about 63
 * ticks under GAME_HANG_GRAVITY_SCALE and JumpSystem then holds it in a 250ms
 * landing cooldown, so from the moment it commits to a jump it cannot make
 * another for roughly 1260ms — 252px of course — and it commits PILOT_JUMP_LEAD
 * early on top of that. At 1400ms the next obstacle arrived while the pet was
 * still in that cooldown, so every round died on its second hurdle no matter
 * how well it was played.
 *
 * This is the floor of what is survivable plus a margin. Anything tighter is
 * not difficulty, it is an unwinnable round.
 */
export const COURSE_SPAWN_INTERVAL_MS = 2_200;

/**
 * The same gap as a distance, and the floor a *tool-use* course honours too.
 *
 * Derived from the rhythm rather than restated, so the two can never drift.
 *
 * The auto course paces itself and so was always survivable; a tool-use course
 * is paced by somebody else's agent, and two tool calls landing a few hundred
 * milliseconds apart put two obstacles close enough together that no jump
 * clears both — the pet is still in its landing cooldown when the second one
 * arrives. That is the "two flames" round, and even the pilot lost it.
 *
 * The answer is not to drop the second call. Every obstacle in a tool-use round
 * *is* a tool call, and a course that silently swallows some of them stops
 * being a reading of what the agent is doing. So the obstacle is laid further
 * out instead: it enters behind the one already furthest away, keeps its place
 * in the order, and simply takes longer to arrive.
 */
export const COURSE_MIN_OBSTACLE_GAP = (COURSE_SPAWN_INTERVAL_MS / 16) * COURSE_SCROLL_SPEED;

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

/**
 * The pet is picking itself up after clipping an obstacle.
 *
 * A component with a deadline rather than a phase on the session, because it is
 * about the *pet* — the animation layer reads it directly, and a round that
 * ends while a pet is still on the floor should still let it finish standing up.
 */
export type GameStumbleComponent = {
  type: "GameStumble";
  /**
   * When the pet may pick itself up, or GAME_STUMBLE_UNTIL_SWEPT while it is
   * down for good.
   */
  until: number;
};

/** How long the pet spends down after a hit. Long enough to read, short enough to forgive. */
export const GAME_STUMBLE_MS = 700;

/**
 * A stumble with no deadline: the pet stays down until the course is taken away.
 *
 * For the clip that *ends* a round, which the 700ms above reads wrong. A
 * finished round keeps its last obstacle on screen for GAME_OVER_LINGER_MS,
 * because the wreck is the report — so a pet that dusted itself off after two
 * fifths of a second stood there idling, cheerfully, beside the cactus that had
 * just ended its round. Whatever the two of them were saying, it was not the
 * same thing.
 *
 * Infinity rather than `endedAt + GAME_OVER_LINGER_MS` so the two cannot drift:
 * the sweep is what clears this, so the pet is up at the moment the course goes
 * and not a tick either side of it, however the linger is later tuned — or
 * however the round ended, since stopping one by hand sweeps it too.
 */
export const GAME_STUMBLE_UNTIL_SWEPT = Number.POSITIVE_INFINITY;

/**
 * The pet's body as the *course* measures it: a fraction of its physics box,
 * anchored at its feet.
 *
 * A fraction and not a fixed inset, because the physics box is not the animal.
 * An adopted pet's body is the sprite cell's body rect (156x156 at scale 1, and
 * twice that at the largest size the resize handle allows) — a square drawn
 * around the whole cell so a pointer can grab it, several times the 32x38 the
 * engine's default constants were tuned against. A flat 6px of slack off a box
 * that size is nothing: the hit fired on the tail, on the ear, on the empty
 * corner beside the head, which is exactly the "it never touched it" this is
 * here to answer.
 *
 * Width is where nearly all the slack goes. Measured off the spritesheets, the
 * drawn pet fills about 0.88 of the body rect's width — but most of that is
 * tail, ears and whiskers, and a runner game hits on the trunk and the legs.
 * The height keeps almost all of the box: it is anchored at the feet, so what
 * it decides is how high a jump has to be, and that is difficulty rather than
 * unfairness.
 *
 * Narrowing the pet also shortens the *crossing*, which is what made the round
 * unplayable rather than merely unfair — see GAME_HANG_GRAVITY_SCALE.
 */
export const PET_CLIP_WIDTH_RATIO = 0.45;
export const PET_CLIP_HEIGHT_RATIO = 0.86;

/**
 * The same, for an obstacle: an emoji does not fill the box drawn around it.
 * Applied to both axes, so the height a jump must clear comes down with it.
 */
export const OBSTACLE_CLIP_RATIO = 0.72;

/**
 * Gravity on a pet that is off the floor mid-round, as a multiple of the
 * world's.
 *
 * The round was not hard, it was arithmetically impossible, and this is half of
 * why. A jump is mass-compensated (deriveAdoptedPetLocomotion), so every pet
 * rises the same ~48px and is off the floor for the same ~38 ticks whatever
 * size it is drawn at — but the obstacle has to cross the pet's *width*, which
 * is not compensated at all. Measured: a default-scale desktop pet needs 29
 * ticks of clearance and a full-size one 53, against 27 ticks actually spent
 * high enough to be clear. Every round ended on a hurdle the pet had jumped.
 *
 * Lighter gravity while airborne is the floaty-jump trick every platformer
 * uses, and it is the right knob here because it buys hang time without
 * touching the impulse — the take-off still looks like the pet's own jump, it
 * just stays up long enough for the course to pass underneath. Measured, 0.55
 * gives an arc of 63 ticks peaking at 68px, against 38 ticks and 48px at the
 * world's own gravity.
 *
 * It is this low rather than merely lower because of the tall cactus. A pet at
 * the largest size the resize handle allows spends about 50 ticks crossing one,
 * and has to be above its 42px for all of them: at 0.60 the round still died on
 * the first one it met, and 0.58 was where it started surviving. This is that
 * boundary with room to spare, since the pilot plays it better than a hand on
 * the keys does.
 *
 * Only ever applied to a pet with no wings: a flying pet's gravity belongs to
 * the trinket that gave it (see ItemAbilitySystem), and two writers on one
 * number is a fight neither wins.
 */
export const GAME_HANG_GRAVITY_SCALE = 0.55;

/**
 * How much clear air the pet's own pilot wants before it commits, in engine
 * pixels — measured from the point the two clip boxes would touch, not from
 * the pet's centre.
 *
 * From the centre is what it used to be, and it is wrong for the same reason a
 * flat hit inset was: the distance from a pet's centre to its own leading edge
 * is a property of how big the pet is drawn, and it ranges over an order of
 * magnitude. A pet scaled up past about 1.5 was asked to jump when the hurdle
 * was already inside it.
 *
 * ~50px is a third of a second at COURSE_SCROLL_SPEED, comfortably more than
 * the few ticks a jump needs to clear an obstacle's height. Too early and the
 * pet lands on the hurdle it was clearing; too late and it walks into it.
 */
export const PILOT_JUMP_LEAD = 50;

/**
 * The obstacle kinds a course is made of — every prop kind except the ball.
 *
 * A course reads as a sentence about what the agent is doing, so the shapes are
 * chosen to be told apart at a glance rather than to be varied: reading is
 * frequent and low, editing is occasional and solid, running something flickers
 * and has timing. The last three are not obstacles to clear at all — they are
 * how a round ends, or stops.
 */
export type CourseObstacleKind = Exclude<WorldPropKind, "ball">;

/**
 * Each obstacle's body.
 *
 * Height carries the meaning: a hurdle is jumpable, and a gate or a wall is
 * deliberately not — those are the ones the agent has to clear, not the pet.
 * The finish flag is tall too, but nothing ever clips it: the round is already
 * over by the time it arrives.
 */
export const COURSE_OBSTACLE_SIZE: Record<CourseObstacleKind, { width: number; height: number }> = {
  hurdle: { width: 26, height: 30 },
  // The same cactus doubled, and the numbers say exactly that: the drawing is
  // two of the unit glyph in the same direction (see `span` in
  // prop-presentation.ts), so the box and the picture cannot disagree.
  //
  // Tall is the one that costs a higher jump; wide is the one that costs a
  // longer one. Both are clearable at every size the resize handle allows —
  // that is asserted, not assumed, because it stopped being true once before.
  "hurdle-tall": { width: 26, height: 58 },
  "hurdle-wide": { width: 52, height: 30 },
  "book-stack": { width: 30, height: 24 },
  toolbox: { width: 26, height: 32 },
  flame: { width: 24, height: 34 },
  gate: { width: 30, height: 52 },
  finish: { width: 28, height: 52 },
  wall: { width: 30, height: 56 },
};

/**
 * What a practice course is made of, as a bag drawn from at random.
 *
 * A bag rather than weights, because the weighting *is* the list: the plain
 * cactus twice, each big one once, so half the course is the obstacle the
 * player already knows how to read and the other half is the two that ask a
 * different question. A course of identical hurdles is one question asked over
 * and over, which is what a practice round was.
 *
 * Only the practice course. A tool-use course's shapes are decided by what the
 * agent is doing and picking one at random there would be a lie.
 */
export const PRACTICE_OBSTACLE_KINDS: readonly CourseObstacleKind[] = [
  "hurdle",
  "hurdle",
  "hurdle-tall",
  "hurdle-wide",
];

/** The obstacle a tool call becomes, by the activity the agent reported. */
export const COURSE_OBSTACLE_FOR_ACTIVITY: Record<"study" | "edit" | "run", CourseObstacleKind> = {
  study: "book-stack",
  edit: "toolbox",
  run: "flame",
};

/**
 * Where a gate, a finish or a wall appears — close enough that the pet is
 * plainly standing at it rather than watching it approach from off screen.
 * These are not obstacles to time; they are the round changing state.
 */
export const COURSE_MARKER_AHEAD = 120;

/**
 * How long a finished round stays on screen before it is swept.
 *
 * A round that vanished the instant it ended would leave nothing to read — the
 * flag or the wall *is* the report, and it has to be there long enough to be
 * seen. It is also the only thing that takes the obstacle windows away, so this
 * is not merely a flourish.
 */
export const GAME_OVER_LINGER_MS = 2_600;
