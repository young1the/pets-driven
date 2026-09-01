import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { isMovementStilled } from "@pets-driven/pet-engine/core/quiet-mode";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import {
  COURSE_LANE_BACK,
  COURSE_LANE_FORWARD,
  COURSE_REAP_BEHIND,
  COURSE_SCROLL_SPEED,
  COURSE_SPAWN_AHEAD,
  COURSE_SPAWN_INTERVAL_MS,
  GAME_SESSION_ENTITY_ID,
  GAME_STUMBLE_MS,
  type GameControlSource,
  type GamePhase,
  type GameSpawnSource,
  HURDLE_SIZE,
  MAX_LIVE_OBSTACLES,
  OBSTACLE_HIT_INSET,
} from "@pets-driven/pet-engine/features/game/components";
import { INTERACTION_ENTITY_ID } from "@pets-driven/pet-engine/features/interaction/systems";
import type { MatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import { createHurdleProp } from "@pets-driven/pet-engine/features/props/entities";
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
): string | null {
  const petTransform = components.getComponent(petId, "Transform");
  const petBody = components.getComponent(petId, "PhysicsBody");
  if (!petTransform || !petBody) return null;

  const id = `game-obstacle-${now}`;
  if (components.getEntity(id)) return null;

  // Feet on the same line as the pet's: the pet's centre is half its body above
  // the floor, so the hurdle's centre is half of *its* body above that floor.
  const floorY = petTransform.position.y + petBody.height / 2;
  const position = {
    x: petTransform.position.x + COURSE_SPAWN_AHEAD,
    y: floorY - HURDLE_SIZE.height / 2,
  };

  components.spawn(id, createHurdleProp(position, now, id).components);
  physics.addRectangle(id, position, { ...HURDLE_SIZE });

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

  const petTransform = components.getComponent(session.petId, "Transform");
  if (!petTransform) return;

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

    if (!obstacle.cleared && clipsPet(components, session.petId, entry.id)) {
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
