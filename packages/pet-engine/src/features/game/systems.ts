import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { isMovementStilled } from "@pets-driven/pet-engine/core/quiet-mode";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import {
  claim,
  clearMotionTarget,
  setPetSteering,
} from "@pets-driven/pet-engine/features/behavior/claim";
import {
  COURSE_LANE_BACK,
  COURSE_LANE_FORWARD,
  COURSE_MARKER_AHEAD,
  COURSE_MIN_OBSTACLE_GAP,
  COURSE_OBSTACLE_FOR_ACTIVITY,
  COURSE_OBSTACLE_SIZE,
  COURSE_REAP_BEHIND,
  COURSE_SCROLL_SPEED,
  COURSE_SPAWN_AHEAD,
  COURSE_SPAWN_INTERVAL_MS,
  type CourseObstacleKind,
  GAME_HANG_GRAVITY_SCALE,
  GAME_OVER_LINGER_MS,
  GAME_ROUND_CLAIM_MS,
  GAME_ROUND_REASON,
  GAME_SESSION_ENTITY_ID,
  GAME_STUMBLE_MS,
  GAME_STUMBLE_UNTIL_SWEPT,
  type GameControlSource,
  type GamePhase,
  type GameSpawnSource,
  MAX_LIVE_OBSTACLES,
  OBSTACLE_CLIP_RATIO,
  PET_CLIP_HEIGHT_RATIO,
  PET_CLIP_WIDTH_RATIO,
  PILOT_JUMP_LEAD,
  PRACTICE_OBSTACLE_KINDS,
} from "@pets-driven/pet-engine/features/game/components";
import { INTERACTION_ENTITY_ID } from "@pets-driven/pet-engine/features/interaction/systems";
import type { MatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import { createObstacleProp } from "@pets-driven/pet-engine/features/props/entities";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * The slice of the physics world a course needs: it pins speeds, and it makes a
 * jump hang (see GAME_HANG_GRAVITY_SCALE). Nothing more.
 */
type CourseVelocityWriter = {
  setVelocity(id: string, velocity: { x?: number; y?: number }): void;
  setGravityScale(id: string, scale: number): void;
  /**
   * Taking an obstacle away is two things, not one. Destroying the entity is
   * what closes its window; dropping the body is what stops Matter simulating a
   * rectangle nothing can see for the rest of the session.
   */
  removeBody(id: string): void;
};

/**
 * Runs the opening countdown, follows who is driving, and ends a session whose
 * pet has left.
 *
 * The countdown is the only thing this step of the feature does with time, and
 * it is deliberately not a flourish: a course that simply starts moving gives
 * the user no moment to take the controls, and gives the pet no moment to be
 * seen being handed a course rather than wandering into one.
 *
 * `control` is *derived* from the keyboard, never stored against it. The user
 * takes a pet by pressing on it and hands it back with Escape, and that is
 * already the whole gesture — a round that kept its own answer would need a
 * second control to set, and would be wrong every time the two disagreed. So
 * taking the controls mid-round is just clicking the pet, and giving them back
 * is Escape, which ends nothing: the round carries on with the pet driving.
 *
 * A stilled world (Quiet Mode `still`) freezes the countdown where it is rather
 * than cancelling the session. The user asked the pets to hold still, not to
 * forget what they were doing — turning the mode off resumes the round.
 */
export function runGameSessionSystem(
  components: ComponentStore,
  deltaMs: number,
  stilled: boolean,
  now = 0,
): void {
  const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
  if (!session?.petId) return;

  // The pet was sent home, or removed while it was on the course. A session
  // pointing at nothing is over; nothing else in the world has to know.
  if (!components.getComponent(session.petId, "PetIdentity")) {
    session.petId = null;
    session.phase = "over";
    return;
  }

  const steering = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
  session.control = steering?.entityId === session.petId ? "user" : "pet";

  if (session.phase !== "over") {
    holdRunner(components, session.petId, now);
  }

  if (stilled) return;

  if (session.phase === "countdown") {
    session.countdownMs = Math.max(0, session.countdownMs - deltaMs);
    if (session.countdownMs === 0) {
      session.phase = "running";
    }
  }
}

export const GameSessionSystem: SimulationSystem<WorldStepContext> = {
  name: "GameSessionSystem",
  // After the agent's own events have landed, so a round that a later step ends
  // on a task result is reading this tick's task state and not the last one's.
  dependsOn: ["AgentTaskEventSystem"],
  reads: ["GameSession", "PetIdentity", "KeyboardControlTarget"],
  writes: ["GameSession", "BehaviorDecisionState", "MotionTarget", "Steering"],
  update(ctx) {
    runGameSessionSystem(
      ctx.components,
      ctx.deltaMs,
      isMovementStilled(ctx.quietMode),
      ctx.clock.now(),
    );
  },
};

/**
 * Puts obstacles on the course and takes them away again.
 *
 * The pet runs in place and the scenery moves — the dino-game arrangement. It
 * is not the showier of the two options (a pet actually crossing the desktop
 * looks better in a screenshot), but it is the one that does not need an answer
 * for what happens at the edge of a monitor, and the pet is already animated as
 * running by its own travel row.
 *
 * `spawn: "auto"` is the plain rhythm below. `tool-use` will hang its vocabulary
 * off the agent's own events on this same spawn path.
 */
export function runGameSpawnSystem(ctx: {
  components: ComponentStore;
  physics: Pick<MatterPhysicsWorld, "addRectangle">;
  clock: Clock;
  stilled: boolean;
  /** Which of the practice course's hurdles comes next. The world's, not the
   * platform's: the simulation stays deterministic and headless. */
  random: RandomSource;
}): void {
  const { components, physics, clock, stilled, random } = ctx;
  const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
  if (!session?.petId || session.phase !== "running" || stilled) return;
  if (session.spawn !== "auto") return;

  const now = clock.now();
  const live = components.query("GameObstacle");
  if (live.length >= MAX_LIVE_OBSTACLES) return;

  const newest = live.reduce((latest, entry) => {
    const obstacle = entry.components[0];
    return Math.max(latest, obstacle.spawnedAt);
  }, 0);
  if (live.length > 0 && now - newest < COURSE_SPAWN_INTERVAL_MS) return;

  const index = Math.min(
    PRACTICE_OBSTACLE_KINDS.length - 1,
    Math.floor(random.next() * PRACTICE_OBSTACLE_KINDS.length),
  );
  spawnObstacle(components, physics, session.petId, now, PRACTICE_OBSTACLE_KINDS[index]);
}

/**
 * One hurdle, entering from ahead of the pet at the pet's own floor line.
 *
 * Exported because the tool-use spawner will want exactly this and differ only
 * in *when* it asks and what the obstacle is called.
 */
export function spawnObstacle(
  components: ComponentStore,
  physics: Pick<MatterPhysicsWorld, "addRectangle">,
  petId: string,
  now: number,
  kind: CourseObstacleKind = "hurdle",
  ahead: number = COURSE_SPAWN_AHEAD,
): string | null {
  const petTransform = components.getComponent(petId, "Transform");
  const petBody = components.getComponent(petId, "PhysicsBody");
  if (!petTransform || !petBody) return null;

  const id = `game-obstacle-${kind}-${now}`;
  if (components.getEntity(id)) return null;

  const size = COURSE_OBSTACLE_SIZE[kind];
  // Feet on the same line as the pet's: the pet's centre is half its body above
  // the floor, so the obstacle's centre is half of *its* body above that floor.
  const floorY = petTransform.position.y + petBody.height / 2;
  const position = {
    x: petTransform.position.x + ahead,
    y: floorY - size.height / 2,
  };

  components.spawn(id, createObstacleProp(kind, position, now, id).components);
  physics.addRectangle(id, position, { ...size });

  return id;
}

/**
 * Moves the course past the pet, scores what it clears, and sweeps what is done.
 *
 * The scroll is a velocity pinned every tick rather than a force, for the same
 * reason keyboard control pins one: the speed is the design, not an outcome to
 * be negotiated with drag. Only `x` is pinned — gravity keeps a hurdle standing
 * on the floor underneath it, so a course laid over uneven ground still works.
 */
export function runGameCourseSystem(
  components: ComponentStore,
  physics: CourseVelocityWriter,
  deltaMs: number,
  stilled: boolean,
  now = 0,
): void {
  clearLapsedStumbles(components, now);

  const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
  if (!session) return;

  // A session with no pet cannot have a course, and whatever is still standing
  // on the desktop is nobody's. Two ways to get here and neither is the round
  // simply finishing: the user stopped it outright (world.endGame), or the pet
  // was sent home mid-round and GameSessionSystem let the session go.
  //
  // The guard used to be `!session.petId` and an early return, which meant both
  // of those left every obstacle where it stood — real always-on-top windows,
  // frozen, with nothing left running that would ever take them away. This is
  // still the only thing that sweeps a prop; it just no longer needs a pet to
  // do it.
  if (!session.petId) {
    sweepCourse(components, physics);
    return;
  }

  const petId = session.petId;
  const petTransform = components.getComponent(petId, "Transform");
  if (!petTransform) return;

  // A finished round keeps its last obstacle for a beat — the flag or the wall
  // *is* the report — then takes every window away. Nothing else sweeps a prop.
  if (session.phase === "over") {
    if (session.endedAt > 0 && now - session.endedAt >= GAME_OVER_LINGER_MS) {
      sweepCourse(components, physics);
      session.petId = null;
    } else if (session.endedAt === 0) {
      session.endedAt = now;
    }
  }

  const running = session.phase === "running" && !stilled;

  for (const entry of components.query("GameObstacle", "Transform")) {
    const [obstacle, transform] = entry.components;

    if (!running) {
      // Held where they are: a stilled world, and the countdown before the
      // round, both mean the course has not started coming yet.
      physics.setVelocity(entry.id, { x: 0 });
      continue;
    }

    physics.setVelocity(entry.id, { x: -COURSE_SCROLL_SPEED });

    if (!obstacle.cleared && clipsPet(components, petId, entry.id)) {
      // Cleared on contact as well as on passing, so one obstacle can only ever
      // cost the pet once however long the two stay overlapped.
      obstacle.cleared = true;
      stumble(components, session, now);
    }

    const behindPet = transform.position.x < petTransform.position.x;
    if (behindPet && !obstacle.cleared) {
      obstacle.cleared = true;
      // Reached here, the obstacle went past untouched — a clip would have
      // claimed `cleared` on contact — so this is the one place a dodge can be
      // counted, and it is counted once.
      if (isDodgeable(components, entry.id)) session.cleared += 1;
    }

    if (transform.position.x < petTransform.position.x - COURSE_REAP_BEHIND) {
      physics.removeBody(entry.id);
      components.destroy(entry.id);
    }
  }

  holdPetAloft(components, physics, petId, running);

  if (running) {
    holdPetInLane(components, physics, session);

    // Distance covered, which in a tool-use round is how long the agent's task
    // has been going. Kept as a float and floored only when it is read.
    session.score += (COURSE_SCROLL_SPEED * deltaMs) / 16;
  }
}

/**
 * The kinds that count towards the tally, which is every kind but the three
 * that are the round changing state rather than something to get over.
 *
 * None of the three is ever actually passed — the course stops dead the moment
 * one is laid — so this filter guards a case that cannot happen today. It is
 * here because the tally has to mean "obstacles you got over" whatever a later
 * marker does, and a number that quietly counts a finish line is worse than no
 * number at all.
 */
const MARKER_KINDS: ReadonlySet<string> = new Set(["gate", "finish", "wall"]);

function isDodgeable(components: ComponentStore, obstacleId: string): boolean {
  const kind = components.getComponent(obstacleId, "WorldProp")?.kind;
  return kind !== undefined && !MARKER_KINDS.has(kind);
}

/**
 * Lighter gravity while a pet on a course is off the floor, and the world's own
 * the rest of the time.
 *
 * Written every tick rather than latched on take-off and released on landing:
 * a round can end, a pet can be swapped, and Quiet Mode can freeze the world
 * mid-arc, and every one of those is a way for a latch to be left holding a pet
 * at two thirds gravity for the rest of its life. Re-deciding from the jump's
 * own phase costs one map write and cannot get stuck.
 *
 * Skipped outright for a pet wearing wings: FlightSystem writes the same number
 * from `CanFly`, and the two would take turns overwriting each other.
 */
function holdPetAloft(
  components: ComponentStore,
  physics: CourseVelocityWriter,
  petId: string,
  running: boolean,
): void {
  if (components.getComponent(petId, "CanFly")) return;

  const phase = components.getComponent(petId, "JumpActionState")?.phase;
  const aloft = running && (phase === "rising" || phase === "falling");

  physics.setGravityScale(petId, aloft ? GAME_HANG_GRAVITY_SCALE : 1);
}

export const GameSpawnSystem: SimulationSystem<WorldStepContext> = {
  name: "GameSpawnSystem",
  dependsOn: ["GameSessionSystem"],
  reads: ["GameSession", "GameObstacle", "Transform", "PhysicsBody"],
  writes: ["GameObstacle", "WorldProp", "Transform", "PhysicsBody"],
  update(ctx) {
    runGameSpawnSystem({
      components: ctx.components,
      physics: ctx.physics,
      clock: ctx.clock,
      stilled: isMovementStilled(ctx.quietMode),
      random: ctx.random,
    });
  },
};

export const GameCourseSystem: SimulationSystem<WorldStepContext> = {
  name: "GameCourseSystem",
  // After KeyboardControlMovementSystem so the pin below is the last word on
  // the pet's horizontal: a user leaning on a direction key must not be able to
  // walk the pet off its own course.
  dependsOn: ["KeyboardControlMovementSystem"],
  reads: [
    "GameSession",
    "GameObstacle",
    "WorldProp",
    "Transform",
    "PhysicsBody",
    "JumpActionState",
    "CanFly",
  ],
  writes: ["GameSession", "GameObstacle", "GameStumble", "PhysicsVelocity"],
  update(ctx) {
    runGameCourseSystem(
      ctx.components,
      ctx.physics,
      ctx.deltaMs,
      isMovementStilled(ctx.quietMode),
      ctx.clock.now(),
    );
  },
};

/**
 * Keeps the pet on its course without nailing it to one spot.
 *
 * Two different jobs, which is why this is not one rule:
 *
 * A pet nobody is driving holds its ground, because the course is what moves
 * and a pet left to its own planner would simply wander off mid-round. A pet
 * the user has taken is free inside a lane — that freedom *is* the game's
 * second verb, closing on a hurdle to jump it late or backing off to take it
 * early — and is stopped only at the edges, where the alternative is walking
 * off the course entirely.
 *
 * The stop is a velocity of zero rather than a position snap: a pet shoved back
 * to the boundary every tick judders, while one that simply stops pressing
 * forward looks like it is leaning on a wall, which is what it is doing.
 */
function holdPetInLane(
  components: ComponentStore,
  physics: CourseVelocityWriter,
  session: { petId: string | null; control: GameControlSource; anchorX: number },
): void {
  if (!session.petId) return;

  if (session.control !== "user") {
    physics.setVelocity(session.petId, { x: 0 });
    return;
  }

  const transform = components.getComponent(session.petId, "Transform");
  if (!transform) return;

  // Which way the user is leaning, not which way the body happens to be going:
  // the stop has to be one-directional or the pet sticks to the edge it
  // reached. Zeroing outright would cancel the very press trying to bring it
  // back, and the lane would be a trap rather than a boundary.
  const pressing =
    components.getComponent(INTERACTION_ENTITY_ID, "KeyboardInputState")?.vector.x ?? 0;
  const offset = transform.position.x - session.anchorX;

  if (offset >= COURSE_LANE_FORWARD && pressing > 0) {
    physics.setVelocity(session.petId, { x: 0 });
    return;
  }
  if (offset <= -COURSE_LANE_BACK && pressing < 0) {
    physics.setVelocity(session.petId, { x: 0 });
  }
}

/**
 * Whether the pet and an obstacle are actually touching.
 *
 * A box overlap and not a physics collision, deliberately. The two bodies never
 * collide in Matter — a pet and a prop share a category that only ever meets
 * the floor — and that is what lets a hurdle slide *through* a pet that failed
 * to jump rather than shoving it off its own course. The clip is a fact the
 * course reads, not a force either body feels, which is the same trade
 * PropKickSystem makes for the ball.
 */
function clipsPet(components: ComponentStore, petId: string, obstacleId: string): boolean {
  const petTransform = components.getComponent(petId, "Transform");
  const petBody = components.getComponent(petId, "PhysicsBody");
  const transform = components.getComponent(obstacleId, "Transform");
  const body = components.getComponent(obstacleId, "PhysicsBody");
  if (!petTransform || !petBody || !transform || !body) return false;

  // Both boxes are shrunk from the top and never from the bottom, because both
  // things stand on the same floor. The pet keeps its feet and loses the air
  // over its head; the obstacle keeps its base and loses the margin around its
  // glyph. Shrinking about the centres instead would float the obstacle off the
  // ground and lower the bar a jump has to clear, turning a fairness fix into a
  // difficulty change.
  const petHalfWidth = (petBody.width * PET_CLIP_WIDTH_RATIO) / 2;
  const petHeight = petBody.height * PET_CLIP_HEIGHT_RATIO;
  const obstacleHalfWidth = (body.width * OBSTACLE_CLIP_RATIO) / 2;
  const obstacleHeight = body.height * OBSTACLE_CLIP_RATIO;

  const petCentreY = petTransform.position.y + petBody.height / 2 - petHeight / 2;
  const obstacleCentreY = transform.position.y + body.height / 2 - obstacleHeight / 2;

  return (
    Math.abs(transform.position.x - petTransform.position.x) < petHalfWidth + obstacleHalfWidth &&
    Math.abs(obstacleCentreY - petCentreY) < (petHeight + obstacleHeight) / 2
  );
}

/**
 * What a clip costs, which is not the same thing in the two kinds of round.
 *
 * A practice round is a game, so a hit ends it — a score means nothing if
 * nothing can take it away.
 *
 * A tool-use round is not a game and must never be lost. Its length is decided
 * by somebody else's agent, and a pet knocked out of a run because a tool call
 * arrived at an awkward moment would be punishing the user for their own
 * build. So the pet trips, gets up, and carries on; only the agent ends that
 * round.
 */
function stumble(
  components: ComponentStore,
  session: { petId: string | null; spawn: GameSpawnSource; phase: GamePhase },
  now: number,
): void {
  if (!session.petId) return;

  // A practice round ends here, and the pet stays down for as long as the
  // course it lost to is still standing — see GAME_STUMBLE_UNTIL_SWEPT. A
  // tool-use round carries on, so this one is a trip: down long enough to read,
  // then up and running again.
  const endsTheRound = session.spawn === "auto";

  components.setComponent(session.petId, {
    type: "GameStumble",
    until: endsTheRound ? GAME_STUMBLE_UNTIL_SWEPT : now + GAME_STUMBLE_MS,
  });

  if (endsTheRound) {
    session.phase = "over";
  }
}

/** Let a pet back up once its stumble has run out. */
export function clearLapsedStumbles(components: ComponentStore, now: number): void {
  for (const entry of components.query("GameStumble")) {
    if (entry.components[0].until <= now) {
      components.removeComponent(entry.id, "GameStumble");
    }
  }
}

/**
 * The pet playing its own round.
 *
 * Deliberately the smallest thing that can be called a player: find the nearest
 * obstacle still ahead, and ask to jump when it is close enough. Everything
 * that makes a jump a jump — being on the ground, the landing cooldown, an
 * impulse scaled to this body and this personality — already belongs to
 * JumpSystem, so the pilot only decides *when*.
 *
 * It takes no claim and writes no decision. A pet on a course is still its
 * agent's pet: `agent-event` must be able to interrupt at any moment, and a
 * pilot that grabbed the body to play would be the reason a report was missed.
 *
 * Silent while the user is driving. Two of them steering at once would fight
 * over the same jump, and the point of taking the controls is that they are
 * yours.
 */
export function runGamePilotSystem(components: ComponentStore, stilled: boolean): void {
  const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
  if (!session?.petId || session.phase !== "running" || stilled) return;
  if (session.control !== "pet") return;
  // Down after a clip: it cannot jump, and asking would queue a jump for the
  // moment it stands up, which is not where the obstacle will be.
  if (components.getComponent(session.petId, "GameStumble")) return;
  if (components.getComponent(session.petId, "JumpActionState")) return;

  const petTransform = components.getComponent(session.petId, "Transform");
  const petBody = components.getComponent(session.petId, "PhysicsBody");
  if (!petTransform || !petBody) return;

  // The pet's own leading edge, which is where a clip is decided from and
  // therefore where the pilot has to measure from too.
  const petReach = (petBody.width * PET_CLIP_WIDTH_RATIO) / 2;

  for (const entry of components.query("GameObstacle", "Transform")) {
    const gap = entry.components[1].position.x - petTransform.position.x;
    // Already alongside or past: it is either being cleared or leaving, and a
    // jump now would only land on the next one.
    if (gap < petReach) continue;

    const width = components.getComponent(entry.id, "PhysicsBody")?.width ?? 0;
    const contact = petReach + (width * OBSTACLE_CLIP_RATIO) / 2;
    if (gap - contact <= PILOT_JUMP_LEAD) {
      requestPetJump(components, session.petId);
      return;
    }
  }
}

/**
 * Ask JumpSystem for a jump, on the same terms every other caller asks.
 *
 * Shared with the interaction slice's Space key by intent rather than by import:
 * the guard set is the one in movement/systems.ts — a live JumpActionState
 * means one is already in flight or cooling down, and a pet that is flying or
 * on a wall is not walking and has no jump to give.
 */
function requestPetJump(components: ComponentStore, id: string): void {
  if (!components.getComponent(id, "WalkingTag")) return;
  if (components.getComponent(id, "FlyingTag") || components.getComponent(id, "ClimbingTag")) {
    return;
  }
  if (components.getComponent(id, "JumpActionState")) return;

  components.setComponent(id, { type: "JumpActionState", phase: "requested", cooldownMs: 0 });
}

export const GamePilotSystem: SimulationSystem<WorldStepContext> = {
  name: "GamePilotSystem",
  // After the spawner, so an obstacle laid this tick is already a thing the
  // pilot can see rather than something it learns about a tick late.
  dependsOn: ["GameSpawnSystem"],
  reads: ["GameSession", "GameObstacle", "Transform", "PhysicsBody", "GameStumble", "WalkingTag"],
  writes: ["JumpActionState"],
  update(ctx) {
    runGamePilotSystem(ctx.components, isMovementStilled(ctx.quietMode));
  },
};

/**
 * The course an agent lays for its own pet.
 *
 * This is the mode the whole feature exists for. A practice round is a game; a
 * tool-use round is a *reading* — obstacle density is how busy the agent is,
 * and the shapes say what it is busy with. The user is not expected to play it.
 *
 * Pulses, not events. A tool call reaches the world as an event the agent
 * systems drain before this ever runs, but it leaves `AgentActivitySignal`
 * behind with the time it landed — so the course watches that timestamp move
 * instead of racing the queue for the event. It also means a burst of calls
 * that share a tick produces one obstacle rather than a wall of them.
 *
 * The three states that are not obstacles at all:
 *
 * - `waiting` stops the course dead at a gate. This is the one that makes the
 *   feature honest — the game halting *is* the report, so what is on screen and
 *   what the user has to do are the same thing rather than competing for
 *   attention. It resumes, gate swept, the moment the agent moves on.
 * - `completed` plants a finish line, `failed` a wall. Both end the round; only
 *   the agent ever ends a tool-use round.
 */
export function runGameToolUseSpawnSystem(ctx: {
  components: ComponentStore;
  // Lays scenery and takes it away again: a gate is swept the moment the agent
  // moves on, and the body has to go with the window.
  physics: Pick<MatterPhysicsWorld, "addRectangle" | "removeBody">;
  clock: Clock;
  stilled: boolean;
}): void {
  const { components, physics, clock, stilled } = ctx;
  const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
  if (!session?.petId || session.spawn !== "tool-use" || stilled) return;
  if (session.phase === "over" || session.phase === "countdown") return;

  const now = clock.now();
  const status = components.getComponent(session.petId, "AgentTaskState")?.status;

  if (status === "completed" || status === "failed") {
    endRoundAt(components, physics, session, status === "failed" ? "wall" : "finish", now);
    return;
  }

  if (status === "waiting") {
    if (session.phase !== "blocked") {
      session.phase = "blocked";
      placeMarker(components, physics, session.petId, "gate", now);
    }
    return;
  }

  if (session.phase === "blocked") {
    // The agent moved on, so the gate did its job and the course starts again.
    sweepObstaclesOfKind(components, physics, "gate");
    session.phase = "running";
  }

  if (session.phase !== "running") return;

  const pulse = components.getComponent(session.petId, "AgentActivitySignal");
  if (!pulse || pulse.at <= session.lastPulseAt) return;
  session.lastPulseAt = pulse.at;

  const live = components.query("GameObstacle", "Transform");
  if (live.length >= MAX_LIVE_OBSTACLES) return;

  // An adapter that reported no activity still moved the heartbeat, so the pet
  // still has something to jump — it is a tool call either way, just an
  // unlabelled one.
  const kind = pulse.activity ? COURSE_OBSTACLE_FOR_ACTIVITY[pulse.activity] : "hurdle";
  spawnObstacle(
    components,
    physics,
    session.petId,
    now,
    kind,
    entryPointBehindTheCourse(components, session.petId, live),
  );
}

/**
 * Where the next tool-use obstacle enters: the usual distance, or a clearable
 * gap behind whatever is already furthest out — whichever is further.
 *
 * See COURSE_MIN_OBSTACLE_GAP. Two tool calls a few hundred milliseconds apart
 * used to land two obstacles close enough that no jump cleared both, and this
 * is the alternative to dropping one of them.
 */
function entryPointBehindTheCourse(
  components: ComponentStore,
  petId: string,
  live: ReadonlyArray<{ id: string }>,
): number {
  const petX = components.getComponent(petId, "Transform")?.position.x;
  if (petX === undefined) return COURSE_SPAWN_AHEAD;

  let furthest = 0;
  for (const entry of live) {
    const x = components.getComponent(entry.id, "Transform")?.position.x;
    if (x !== undefined) furthest = Math.max(furthest, x - petX);
  }

  return Math.max(COURSE_SPAWN_AHEAD, furthest + COURSE_MIN_OBSTACLE_GAP);
}

/** Put a gate, a flag or a wall right where the pet can see it. */
function placeMarker(
  components: ComponentStore,
  physics: Pick<MatterPhysicsWorld, "addRectangle">,
  petId: string,
  kind: CourseObstacleKind,
  now: number,
): void {
  spawnObstacle(components, physics, petId, now, kind, COURSE_MARKER_AHEAD);
}

function endRoundAt(
  components: ComponentStore,
  physics: Pick<MatterPhysicsWorld, "addRectangle" | "removeBody">,
  session: { petId: string | null; phase: GamePhase; endedAt: number },
  kind: CourseObstacleKind,
  now: number,
): void {
  if (!session.petId) return;
  sweepObstaclesOfKind(components, physics, "gate");
  placeMarker(components, physics, session.petId, kind, now);
  session.phase = "over";
  session.endedAt = now;
}

function sweepObstaclesOfKind(
  components: ComponentStore,
  physics: Pick<MatterPhysicsWorld, "removeBody">,
  kind: CourseObstacleKind,
): void {
  for (const entry of components.query("GameObstacle", "WorldProp")) {
    if (entry.components[1].kind !== kind) continue;
    physics.removeBody(entry.id);
    components.destroy(entry.id);
  }
}

/**
 * Take every obstacle off the desktop, and let anyone it knocked down up.
 *
 * Nothing else ever sweeps a prop, which is why this is also where a held
 * stumble ends: the pet stays on the floor for exactly as long as the course
 * that put it there is still standing, so the two leave together rather than
 * the pet getting up first and idling beside the wreck.
 */
export function sweepCourse(
  components: ComponentStore,
  physics: Pick<CourseVelocityWriter, "removeBody">,
): void {
  for (const entry of components.query("GameObstacle")) {
    physics.removeBody(entry.id);
    components.destroy(entry.id);
  }

  for (const entry of components.query("GameStumble")) {
    components.removeComponent(entry.id, "GameStumble");
  }
}

export const GameToolUseSpawnSystem: SimulationSystem<WorldStepContext> = {
  name: "GameToolUseSpawnSystem",
  dependsOn: ["GameSessionSystem"],
  reads: ["GameSession", "GameObstacle", "AgentTaskState", "AgentActivitySignal", "Transform"],
  writes: ["GameSession", "GameObstacle", "WorldProp", "Transform", "PhysicsBody"],
  update(ctx) {
    runGameToolUseSpawnSystem({
      components: ctx.components,
      physics: ctx.physics,
      clock: ctx.clock,
      stilled: isMovementStilled(ctx.quietMode),
    });
  },
};

/**
 * Keep the runner on its course, and out of its own planner's hands.
 *
 * Pinning the velocity is not enough on its own, and finding that out cost a
 * round: a velocity written in POST_UPDATE is overwritten during SIMULATE by
 * the steering *force* the pet's own wander target queued earlier in the same
 * tick. The pet drifted hundreds of pixels off its course while every velocity
 * pin appeared to be working, which also made obstacles close on it faster than
 * the pilot's jump distance was measured for.
 *
 * So the round takes the body the way keyboard control takes it — a standing
 * user-interaction claim — and clears the motion target that produced the
 * force. Claimed here, in BEHAVIOR ahead of BehaviorDecisionSystem, so the
 * planner never hands out a target in the first place rather than having one
 * taken back after the fact.
 *
 * The claim is the same standing kind the keyboard uses, so petting a pet
 * mid-round still pets it.
 */
function holdRunner(components: ComponentStore, petId: string, now: number): void {
  claim(components, petId, "user-interaction", now, GAME_ROUND_REASON, now + GAME_ROUND_CLAIM_MS);
  clearMotionTarget(components, petId);
  setPetSteering(components, petId, "stand");
}
