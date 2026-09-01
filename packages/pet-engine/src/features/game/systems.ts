import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { isMovementStilled } from "@pets-driven/pet-engine/core/quiet-mode";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import {
  COURSE_LANE_BACK,
  COURSE_LANE_FORWARD,
  COURSE_MARKER_AHEAD,
  COURSE_OBSTACLE_FOR_ACTIVITY,
  COURSE_OBSTACLE_SIZE,
  COURSE_REAP_BEHIND,
  COURSE_SCROLL_SPEED,
  COURSE_SPAWN_AHEAD,
  COURSE_SPAWN_INTERVAL_MS,
  type CourseObstacleKind,
  GAME_OVER_LINGER_MS,
  GAME_SESSION_ENTITY_ID,
  GAME_STUMBLE_MS,
  type GameControlSource,
  type GamePhase,
  type GameSpawnSource,
  MAX_LIVE_OBSTACLES,
  OBSTACLE_HIT_INSET,
  PILOT_IGNORE_BEHIND,
  PILOT_JUMP_DISTANCE,
} from "@pets-driven/pet-engine/features/game/components";
import { INTERACTION_ENTITY_ID } from "@pets-driven/pet-engine/features/interaction/systems";
import type { MatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import { createObstacleProp } from "@pets-driven/pet-engine/features/props/entities";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/** The slice of the physics world a course needs: it pins speeds, nothing more. */
type CourseVelocityWriter = {
  setVelocity(id: string, velocity: { x?: number; y?: number }): void;
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
  writes: ["GameSession"],
  update(ctx) {
    runGameSessionSystem(ctx.components, ctx.deltaMs, isMovementStilled(ctx.quietMode));
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
}): void {
  const { components, physics, clock, stilled } = ctx;
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

  spawnObstacle(components, physics, session.petId, now);
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
  if (!session?.petId) return;

  const petId = session.petId;
  const petTransform = components.getComponent(petId, "Transform");
  if (!petTransform) return;

  // A finished round keeps its last obstacle for a beat — the flag or the wall
  // *is* the report — then takes every window away. Nothing else sweeps a prop.
  if (session.phase === "over") {
    if (session.endedAt > 0 && now - session.endedAt >= GAME_OVER_LINGER_MS) {
      sweepCourse(components);
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
    }

    if (transform.position.x < petTransform.position.x - COURSE_REAP_BEHIND) {
      components.destroy(entry.id);
    }
  }

  if (running) {
    holdPetInLane(components, physics, session);

    // Distance covered, which in a tool-use round is how long the agent's task
    // has been going. Kept as a float and floored only when it is read.
    session.score += (COURSE_SCROLL_SPEED * deltaMs) / 16;
  }
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
    });
  },
};

export const GameCourseSystem: SimulationSystem<WorldStepContext> = {
  name: "GameCourseSystem",
  // After KeyboardControlMovementSystem so the pin below is the last word on
  // the pet's horizontal: a user leaning on a direction key must not be able to
  // walk the pet off its own course.
  dependsOn: ["KeyboardControlMovementSystem"],
  reads: ["GameSession", "GameObstacle", "Transform", "PhysicsBody"],
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

  const overlapX = petBody.width / 2 + body.width / 2 - OBSTACLE_HIT_INSET;
  const overlapY = petBody.height / 2 + body.height / 2 - OBSTACLE_HIT_INSET;

  return (
    Math.abs(transform.position.x - petTransform.position.x) < overlapX &&
    Math.abs(transform.position.y - petTransform.position.y) < overlapY
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

  components.setComponent(session.petId, {
    type: "GameStumble",
    until: now + GAME_STUMBLE_MS,
  });

  if (session.spawn === "auto") {
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
  if (!petTransform) return;

  let nearest = Number.POSITIVE_INFINITY;
  for (const entry of components.query("GameObstacle", "Transform")) {
    const gap = entry.components[1].position.x - petTransform.position.x;
    if (gap < -PILOT_IGNORE_BEHIND) continue;
    if (gap < nearest) nearest = gap;
  }

  if (nearest > PILOT_JUMP_DISTANCE) return;

  requestPetJump(components, session.petId);
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
  reads: ["GameSession", "GameObstacle", "Transform", "GameStumble", "WalkingTag"],
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
  physics: Pick<MatterPhysicsWorld, "addRectangle">;
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
    sweepObstaclesOfKind(components, "gate");
    session.phase = "running";
  }

  if (session.phase !== "running") return;

  const pulse = components.getComponent(session.petId, "AgentActivitySignal");
  if (!pulse || pulse.at <= session.lastPulseAt) return;
  session.lastPulseAt = pulse.at;

  if (components.query("GameObstacle").length >= MAX_LIVE_OBSTACLES) return;

  // An adapter that reported no activity still moved the heartbeat, so the pet
  // still has something to jump — it is a tool call either way, just an
  // unlabelled one.
  const kind = pulse.activity ? COURSE_OBSTACLE_FOR_ACTIVITY[pulse.activity] : "hurdle";
  spawnObstacle(components, physics, session.petId, now, kind);
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
  physics: Pick<MatterPhysicsWorld, "addRectangle">,
  session: { petId: string | null; phase: GamePhase; endedAt: number },
  kind: CourseObstacleKind,
  now: number,
): void {
  if (!session.petId) return;
  sweepObstaclesOfKind(components, "gate");
  placeMarker(components, physics, session.petId, kind, now);
  session.phase = "over";
  session.endedAt = now;
}

function sweepObstaclesOfKind(components: ComponentStore, kind: CourseObstacleKind): void {
  for (const entry of components.query("GameObstacle", "WorldProp")) {
    if (entry.components[1].kind === kind) components.destroy(entry.id);
  }
}

/** Take every obstacle off the desktop. Nothing else ever sweeps a prop. */
export function sweepCourse(components: ComponentStore): void {
  for (const entry of components.query("GameObstacle")) {
    components.destroy(entry.id);
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
