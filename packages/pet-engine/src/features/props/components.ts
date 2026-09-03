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
export type WorldPropKind =
  | "ball"
  // Course scenery. The hurdles are what a practice round is made of; the rest
  // are the vocabulary a tool-use round draws from, one shape per thing an
  // agent can be doing. They are told apart by kind and not by a field on
  // GameObstacle because the kind is what reaches the window that draws them.
  //
  // Three hurdles rather than one because a course of identical obstacles is a
  // course with one question in it, asked over and over. The two big ones are
  // the same cactus doubled — twice as tall, or twice as wide — which is a size
  // the drawing can state exactly (see `span` in prop-presentation.ts) rather
  // than a vaguer "big one".
  | "hurdle"
  | "hurdle-tall"
  | "hurdle-wide"
  | "book-stack"
  | "toolbox"
  | "flame"
  | "gate"
  | "finish"
  | "wall";

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
 * A kick is a real impulse between two bodies, resolved along the contact
 * normal, and not a velocity the ball is assigned. That distinction is the
 * whole of this block, and it is worth stating why it had to change: the kick
 * used to write the ball's velocity outright, so the ball's own momentum was
 * discarded at the moment of contact. A ball already rolling at speed, booted
 * from behind by a walking pet, came out *slower* than it went in. It also read
 * only the pet's horizontal travel, so a pet dropping onto the ball did nothing
 * at all, and a pet standing in the path of a ball rolling at it was scenery.
 *
 * The model now is the ordinary one. With `n` the unit normal from pet to prop,
 * `vRel` the closing speed along it, and `u` the reduced mass:
 *
 *     j = ((1 + RESTITUTION) * vRel + BOOT * petClosing) * u
 *
 * The first term is the collision — it is what makes a ball bounce off a
 * motionless pet, and with restitution below 1 it strictly loses energy, so it
 * cannot feed itself. The second is the deliberate boot, the part that is a pet
 * *kicking* rather than merely being in the way; it is priced off the pet's own
 * velocity alone, never the ball's, which is what keeps a ball loose among
 * several pets from amplifying itself (the trap the previous 5x transfer fell
 * into when it was fed relative speed).
 *
 * The spread that produces is worth having precisely because a pet's own speed
 * barely varies: measured, a walking pet travels ~2.1px a tick almost exactly,
 * and only a hurried one (chase-prop runs at a gait multiplier) reaches ~3.9.
 * Scaled up, those become a shove and a boot.
 */
/**
 * Closing speed along the contact normal below which there is no kick at all.
 *
 * Without it a pet parked beside the ball re-kicks it every cooldown forever,
 * because standing still still counts as contact — measured, that was three
 * quarters of all kicks, and on screen it is a ball twitching under a pet that
 * is plainly not doing anything. Something has to actually be moving into
 * something. Since the speed is now *relative*, a ball rolling into a standing
 * pet clears this bar on the ball's account, which is the point.
 */
export const PROP_KICK_MIN_CLOSING = 0.6;
/**
 * Bounciness of the pet-to-prop contact itself, independent of the boot.
 *
 * Below 1 on purpose and not merely for realism: it is the guarantee that the
 * velocity-dependent half of the impulse is dissipative, so a ball rattling
 * between two motionless pets settles instead of climbing to the cap.
 */
export const PROP_KICK_RESTITUTION = 0.6;
/**
 * The boot: how many times over the pet's own closing speed it adds on top of
 * the collision. Tuned so a walking pet still sends the ball off at ~12px a
 * tick, which is the pace the previous constant-plus-transfer kick was tuned to
 * and the pace the chase behavior is priced against.
 */
export const PROP_KICK_BOOT = 4.5;
/** Fractional spread either side, so two identical run-ups still differ. */
export const PROP_KICK_JITTER = 0.2;
/**
 * Ceiling on the velocity change one kick may impart. A pet the user has thrown
 * is travelling far faster than any of its own gaits, and the boundary walls
 * are 48px thick with no continuous collision behind them. The *sum* is bounded
 * separately, by the clamp ThrowImpulseSystem puts on an additive impulse.
 */
export const PROP_KICK_MAX_SPEED = 26;

/**
 * Masses the kick prices each side of the contact at, as a density the body's
 * own footprint is multiplied by.
 *
 * Only the ratio matters, and it is the one number that decides how much of the
 * kick comes back at the pet as recoil. A pet is dense and a ball is a shell,
 * which puts a default pet around forty times the ball's mass: enough that the
 * ball leaves with essentially the whole impulse and the pet takes a visible
 * check in its stride rather than ricocheting off its own football.
 *
 * Deliberately not matter.js's own body masses. Reading those would make
 * PropKickSystem the one behavior system that reaches into the physics library,
 * and it would tie the feel of a kick to a density chosen for how bodies fall.
 */
export const PROP_KICK_PET_DENSITY = 0.02;
export const PROP_KICK_PROP_DENSITY = 0.001;

/**
 * Smallest horizontal offset the contact normal is allowed to have.
 *
 * A pet standing dead centre over the ball has no side to read, and a normal
 * pointing straight down is a kick with nowhere to go: it drives the ball into
 * the floor, the floor eats it, and the cooldown expires having achieved
 * nothing. Biasing the normal off-axis is what turns a stomp into a squirt.
 * Which side is drawn from the seeded random when the gap is genuinely zero.
 */
export const PROP_KICK_MIN_LATERAL = 6;
/**
 * How much of a downward kick the floor returns sideways.
 *
 * A pet landing on the ball is closing on it, and the honest objection to
 * acting on that used to be that squashing it downward has nowhere to go from
 * the floor. That is true of the *impulse* and false of the contact: the floor
 * answers with a normal impulse of its own, and a ball squashed between a paw
 * and the ground goes out the side. This is that answer, priced as a fraction
 * because the collision is not elastic.
 */
export const PROP_KICK_STOMP_REDIRECT = 0.5;

/** Upward speed a kick always carries, so even a nudge hops rather than slides. */
export const PROP_KICK_LIFT_BASE = 1;
/**
 * Extra lift per unit of the *pet's* own closing speed: a hard kick lofts the
 * ball. Priced off the pet and not off the relative speed on purpose — a pet
 * standing in the way of a fast ball is blocking it, not scooping it up, and
 * charging the ball's own speed for lift launched it at the ceiling.
 */
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
