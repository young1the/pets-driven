/**
 * Props: the non-pet entities a pet plays *with* rather than picks up.
 *
 * A trinket (features/items) is a marker that stops existing the moment a pet
 * reaches it, and everything interesting about it happens on the pet. A prop is
 * the opposite — it is a body. It falls, rolls, bounces off the walls, and
 * stays on the desktop, so what a pet does to it is visible on the prop itself
 * and the next pet inherits the result.
 *
 * That difference is the whole point of the slice: the ball is the first entity
 * in this world that is neither a pet nor scenery, and it earns its behavior by
 * *composing* components pets already use rather than by owning systems of its
 * own. `PhysicsBody` + `PhysicsMaterial` make it fall and bounce; `CanDrag`
 * makes it grabbable and throwable through the interaction slice's existing
 * drag/throw path, with no code there aware a ball exists; and a kick is
 * expressed as a `ThrowImpulse` — the very component a flick of the mouse puts
 * on a pet — so PropKickSystem never touches the physics engine at all.
 */

/**
 * What kind of prop this is.
 *
 * `ball` is furniture the pets play with. `hurdle` is course scenery: it shares
 * the prop machinery — a body that falls and stands on the floor, and the
 * window the host already draws props in — but it is not a toy, and
 * PropKickSystem skips it (see the GameObstacle guard there).
 */
export type WorldPropKind = "ball" | "hurdle";

/**
 * A prop lying on the desktop.
 *
 * `lastKickBy` / `lastKickAt` are the prop's own memory of who last hit it,
 * which is what keeps a pet standing on top of the ball from re-kicking it
 * sixty times a second. Keeping that record on the *prop* rather than on each
 * pet means a second pet may take the ball straight off the first — the ball is
 * the shared thing, so the contention belongs to it.
 */
export type WorldPropComponent = {
  type: "WorldProp";
  kind: WorldPropKind;
  spawnedAt: number;
  lastKickBy: string | null;
  lastKickAt: number;
};

/** The ball's radius; its PhysicsBody box is the square around it. */
export const BALL_RADIUS = 14;

/** Entity id of the single ball an ordinary scenario scatters. */
export const BALL_ENTITY_ID = "prop-ball";

/**
 * Bounce and drag for the ball.
 *
 * Restitution is high enough that a kick visibly hops rather than skids, and
 * air drag low enough that a rolled ball crosses a stretch of desktop before it
 * settles — a ball that stops dead two body-widths away is not worth chasing.
 */
export const BALL_MATERIAL = {
  friction: 0.02,
  frictionAir: 0.012,
  restitution: 0.6,
} as const;

/**
 * How close a pet's body must come to the ball's centre before it connects.
 * Added to the pet's own half-extents, the same box test ItemPickupSystem uses
 * — a tall pet standing over the ball is plainly touching it even though the
 * centre-to-centre distance says otherwise.
 */
export const BALL_KICK_RADIUS = BALL_RADIUS + 6;

/**
 * Quiet window after a kick before the same pet may kick again. Long enough
 * that a pet chasing the ball down does not stutter-dribble it, short enough
 * that a ball kicked into a corner is freed on the next approach.
 */
export const PROP_KICK_COOLDOWN_MS = 700;

/**
 * What a kick is made of.
 *
 * The ball leaves at the speed the pet was closing on it — its own velocity
 * projected onto the direction it will send the ball — and not at a constant.
 * A constant is what this started as, and it read as one: a walking pet's
 * contribution sat under a fixed floor several times its size, so every kick
 * looked identical whether the pet had strolled into the ball or run it down.
 *
 * The spread that produces is worth having precisely because a pet's own speed
 * barely varies: measured, a walking pet travels ~2.1px a tick almost exactly,
 * and only a hurried one (chase-prop runs at a gait multiplier) reaches ~3.9.
 * Scaled up, those become a shove and a boot; the nudge below is what a pet
 * that is standing still or already walking away still imparts by leaning on
 * it.
 */
/** Speed a barely-moving contact imparts. The floor under a real approach. */
export const PROP_KICK_NUDGE = 2;
/**
 * Closing speed below which there is no kick at all.
 *
 * Without it a pet parked beside the ball re-kicks it every cooldown forever,
 * because standing still still counts as contact — measured, that was three
 * quarters of all kicks, and on screen it is a ball twitching under a pet that
 * is plainly not doing anything. A kick should need someone to actually run
 * into something.
 */
export const PROP_KICK_MIN_CLOSING = 0.6;
/** How much of the pet's closing speed the ball leaves with. */
export const PROP_KICK_TRANSFER = 5;
/** Fractional spread either side, so two identical run-ups still differ. */
export const PROP_KICK_JITTER = 0.2;
/**
 * Ceiling on a kick. A pet the user has thrown is travelling far faster than
 * any of its own gaits, and the boundary walls are 48px thick with no
 * continuous collision behind them — an uncapped transfer would put the ball
 * straight through one.
 */
export const PROP_KICK_MAX_SPEED = 26;

/** Upward speed a kick always carries, so even a nudge hops rather than slides. */
export const PROP_KICK_LIFT_BASE = 1;
/** Extra lift per unit of closing speed: a hard kick lofts the ball. */
export const PROP_KICK_LIFT_PER_SPEED = 1.8;

/** Cue shown on the pet at the moment it connects with a prop. */
export const PROP_KICK_CUE_MS = 900;

/** Curiosity a kick relieves — the ball answers the itch for something new. */
export const PROP_KICK_CURIOSITY_RELIEF = 0.25;

/**
 * Per-tick displacement above which a prop counts as "in motion" to the
 * decision layer. A settling ball still jitters a fraction of a pixel against
 * the floor for a while, so the bar sits clear of that rather than at zero.
 */
export const PROP_ROLLING_SPEED = 1.5;
