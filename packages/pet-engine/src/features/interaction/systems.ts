import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import { statusFreezesMovement } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import { utteranceChannel } from "@pets-driven/pet-engine/features/agent/components";
import type {
  KeyboardWorldEvent,
  PointerWorldEvent,
} from "@pets-driven/pet-engine/features/events/world-event";
import type { WorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import type { Vector } from "@pets-driven/pet-engine/features/physics/components";
import { personalityAcknowledgeFeedback } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import {
  createSeededRandom,
  type RandomSource,
} from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

const INTERACTION_ENTITY_ID = "user-interaction";
const DRAG_START_DISTANCE = 4;
const HIT_TARGET_PADDING = 12;
const MAX_DRAG_SAMPLES = 6;
const THROW_VELOCITY_THRESHOLD = 8;
// Matter.js has no continuous collision detection, so a body that advances more
// than a wall's thickness (48px, see createMonitorBoundaryEntities) in a single
// 16ms step tunnels straight through and the pet is lost off-screen. Cap the
// per-tick throw speed comfortably below that so even a hard flick stays a
// strong-but-contained throw that hits the wall instead of clearing it.
const MAX_THROW_SPEED = 40;

export function runUserInteractionBehaviorSystem(
  components: ComponentStore,
  events: WorldEventQueue,
  clock: Clock,
  random: RandomSource = createSeededRandom(1),
): void {
  const inputEvents = events.drainWhere(
    (event): event is PointerWorldEvent | KeyboardWorldEvent =>
      event.kind === "pointer" || event.kind === "keyboard",
  );

  for (const event of inputEvents) {
    if (event.kind === "pointer") handlePointerEvent(components, event, clock, random);
    if (event.kind === "keyboard") handleKeyboardEvent(components, event);
  }
}

function handlePointerEvent(
  components: ComponentStore,
  event: PointerWorldEvent,
  clock: Clock,
  random: RandomSource,
): void {
  if (event.type === "pointer.down") {
    const controlHit = hitTest(components, event.position, "CanControl");
    const target = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
    if (target) target.entityId = controlHit?.id ?? null;
    if (controlHit) releaseAgentTask(components, controlHit.id, clock.now(), random);

    const dragHit = hitTest(components, event.position, "CanDrag");
    if (!dragHit) return;
    releaseAgentTask(components, dragHit.id, clock.now(), random);

    components.setComponent(INTERACTION_ENTITY_ID, {
      type: "DragInteraction",
      pointerId: event.pointerId,
      entityId: dragHit.id,
      phase: "pending",
      grabOffset: {
        x: dragHit.position.x - event.position.x,
        y: dragHit.position.y - event.position.y,
      },
      pointerPosition: { ...event.position },
      startedAt: clock.now(),
      samples: [{ at: event.at, position: { ...event.position } }],
    });
    return;
  }

  const drag = components.getComponent(INTERACTION_ENTITY_ID, "DragInteraction");
  if (!drag || drag.pointerId !== event.pointerId) return;

  if (event.type === "pointer.move") {
    const first = drag.samples[0]?.position ?? event.position;
    drag.pointerPosition = { ...event.position };
    drag.samples = [...drag.samples, { at: event.at, position: { ...event.position } }].slice(
      -MAX_DRAG_SAMPLES,
    );
    if (drag.phase === "pending" && distance(first, event.position) >= DRAG_START_DISTANCE) {
      drag.phase = "dragging";
      claimUserInteraction(components, drag.entityId, clock.now(), "dragging", 250);
    }
    return;
  }

  if (event.type === "pointer.up") {
    const velocity = clampThrowSpeed(releaseVelocityFromSamples(drag.samples));
    if (Math.hypot(velocity.x, velocity.y) >= THROW_VELOCITY_THRESHOLD) {
      components.setComponent(drag.entityId, { type: "ThrowImpulse", velocity });
      claimUserInteraction(components, drag.entityId, clock.now(), "throw", 500);
      // A thrown pet is ballistic, not keyboard-driven. Drop it as the keyboard
      // control target the pointer.down grab selected, otherwise
      // KeyboardControlMovementSystem's idle-stop (velocity.x = 0 while no key
      // is held) zeroes the throw's horizontal velocity every tick and the arc
      // collapses to a straight drop instead of extending along x.
      const keyboardTarget = components.getComponent(
        INTERACTION_ENTITY_ID,
        "KeyboardControlTarget",
      );
      if (keyboardTarget?.entityId === drag.entityId) keyboardTarget.entityId = null;
    }
    components.removeComponent(INTERACTION_ENTITY_ID, "DragInteraction");
  }
}

// Interacting with a pet acknowledges what the agent reported: the movement
// hold lifts, and a settled status (waiting/failed/completed) clears along
// with its channel badge. Catalog personalities then play a brief
// acknowledgement beat before returning to autonomous life. A live "working"
// status stays; clicking must not erase an agent that is still running.
function releaseAgentTask(
  components: ComponentStore,
  id: string,
  now: number,
  random: RandomSource,
): void {
  components.removeComponent(id, "TaskMovementHold");

  const task = components.getComponent(id, "AgentTaskState");
  if (!task || !statusFreezesMovement(task.status)) return;
  const personality = components.getComponent(id, "Personality");
  const feedback = personalityAcknowledgeFeedback(personality?.catalogId, task.status, random);
  components.removeComponent(id, "AgentTaskState");

  const channel = components.getComponent(id, "AgentChannelState");
  if (channel?.source === "agent-task") {
    components.removeComponent(id, "AgentChannelState");
  }

  if (feedback) {
    const durationMs = 3_000;
    components.setComponent(
      id,
      utteranceChannel({ message: feedback.speech, source: "interaction", now, durationMs }),
    );
    components.setComponent(id, {
      type: "PetExpressionState",
      source: "acknowledge",
      mood: feedback.mood,
      emote: feedback.emote,
      label: null,
      startedAt: now,
      expiresAt: now + durationMs,
    });
    claimUserInteraction(components, id, now, `acknowledge-${task.status}`, durationMs);
    recordPetExperience(components, id, "acknowledged", now);
  }
}

function handleKeyboardEvent(components: ComponentStore, event: KeyboardWorldEvent): void {
  const input = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardInputState");
  if (!input) return;

  const pressed = new Set(input.pressedCodes);
  if (event.type === "keyboard.down") pressed.add(event.code);
  if (event.type === "keyboard.up") pressed.delete(event.code);

  input.pressedCodes = [...pressed];
  input.vector = keyboardVector(pressed);
}

function hitTest(
  components: ComponentStore,
  point: Vector,
  capability: "CanDrag" | "CanControl",
): { id: string; position: Vector } | null {
  const hits: Array<{ id: string; position: Vector; area: number }> = [];
  components.forEach(["Transform", "PhysicsBody", capability], (id, [transform, body]) => {
    const halfW = body.width / 2 + HIT_TARGET_PADDING;
    const halfH = body.height / 2 + HIT_TARGET_PADDING;
    if (
      point.x >= transform.position.x - halfW &&
      point.x <= transform.position.x + halfW &&
      point.y >= transform.position.y - halfH &&
      point.y <= transform.position.y + halfH
    ) {
      hits.push({ id, position: transform.position, area: body.width * body.height });
    }
  });
  hits.sort((a, b) => a.area - b.area);
  return hits[0] ?? null;
}

function keyboardVector(pressed: Set<string>): Vector {
  const x =
    Number(pressed.has("ArrowRight") || pressed.has("KeyD")) -
    Number(pressed.has("ArrowLeft") || pressed.has("KeyA"));
  const y =
    Number(pressed.has("ArrowDown") || pressed.has("KeyS")) -
    Number(pressed.has("ArrowUp") || pressed.has("KeyW"));
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

function claimUserInteraction(
  components: ComponentStore,
  id: string,
  now: number,
  reason: string,
  durationMs: number,
): void {
  components.setComponent(id, {
    type: "BehaviorDecisionState",
    source: "user-interaction",
    decidedAt: now,
    expiresAt: now + durationMs,
    reason,
    lastAutonomousReason: null,
    lastAutonomousAt: null,
  });
}

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type KinematicPhysics = {
  setPosition(id: string, position: Partial<Vector>): void;
  setVelocity(id: string, velocity: Partial<Vector>): void;
};

export function runDraggedEntityKinematicSystem(
  components: ComponentStore,
  physics: KinematicPhysics,
): void {
  const drag = components.getComponent(INTERACTION_ENTITY_ID, "DragInteraction");
  if (drag?.phase !== "dragging") return;

  const nextPosition = {
    x: drag.pointerPosition.x + drag.grabOffset.x,
    y: drag.pointerPosition.y + drag.grabOffset.y,
  };
  const transform = components.getComponent(drag.entityId, "Transform");
  if (transform) transform.position = nextPosition;

  physics.setPosition(drag.entityId, nextPosition);
  physics.setVelocity(drag.entityId, { x: 0, y: 0 });
}

export function releaseVelocityFromSamples(
  samples: Array<{ at: number; position: Vector }>,
): Vector {
  if (samples.length < 2) return { x: 0, y: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsed = Math.max(1, last.at - first.at);
  const ticks = elapsed / 16;
  return {
    x: (last.position.x - first.position.x) / ticks,
    y: (last.position.y - first.position.y) / ticks,
  };
}

// Scale a release velocity down to MAX_THROW_SPEED while preserving direction,
// so a hard flick throws far but never fast enough to tunnel through a wall.
export function clampThrowSpeed(velocity: Vector): Vector {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= MAX_THROW_SPEED) return velocity;
  const scale = MAX_THROW_SPEED / speed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}

export function runThrowImpulseSystem(
  components: ComponentStore,
  physics: Pick<KinematicPhysics, "setVelocity">,
): void {
  components.forEach(["ThrowImpulse"], (id, [throwImpulse]) => {
    physics.setVelocity(id, throwImpulse.velocity);
    components.removeComponent(id, "ThrowImpulse");
  });
}

export function runKeyboardControlMovementSystem(
  components: ComponentStore,
  physics: Pick<KinematicPhysics, "setVelocity">,
  clock: Clock,
): void {
  const target = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
  const input = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardInputState");
  if (!target?.entityId || !input) return;

  const canControl = components.getComponent(target.entityId, "CanControl");
  if (!canControl) return;

  if (input.vector.x === 0 && input.vector.y === 0) {
    physics.setVelocity(target.entityId, { x: 0 });
    return;
  }

  const velocity: Partial<Vector> = {
    x: input.vector.x * canControl.speed,
  };
  if (input.vector.y !== 0) {
    velocity.y = input.vector.y * canControl.speed;
  }

  physics.setVelocity(target.entityId, velocity);
  claimUserInteraction(components, target.entityId, clock.now(), "keyboard-control", 250);
}

export const UserInteractionBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "UserInteractionBehaviorSystem",
  dependsOn: ["ContactSystem"],
  reads: [
    "WorldEventQueue",
    "Transform",
    "PhysicsBody",
    "CanDrag",
    "CanControl",
    "KeyboardControlTarget",
    "KeyboardInputState",
    "DragInteraction",
    "AgentTaskState",
    "AgentChannelState",
    "Personality",
    "PetExpressionState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  writes: [
    "KeyboardControlTarget",
    "KeyboardInputState",
    "DragInteraction",
    "BehaviorDecisionState",
    "TaskMovementHold",
    "AgentTaskState",
    "AgentChannelState",
    "PetExpressionState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runUserInteractionBehaviorSystem(ctx.components, ctx.events, ctx.clock, ctx.random);
  },
};

export const DraggedEntityKinematicSystem: SimulationSystem<WorldStepContext> = {
  name: "DraggedEntityKinematicSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["DragInteraction", "Transform"],
  writes: ["Transform", "PhysicsPosition", "PhysicsVelocity"],
  update(ctx) {
    runDraggedEntityKinematicSystem(ctx.components, ctx.physics);
  },
};

export const ThrowImpulseSystem: SimulationSystem<WorldStepContext> = {
  name: "ThrowImpulseSystem",
  dependsOn: ["DraggedEntityKinematicSystem"],
  reads: ["ThrowImpulse"],
  writes: ["PhysicsVelocity", "ThrowImpulse"],
  update(ctx) {
    runThrowImpulseSystem(ctx.components, ctx.physics);
  },
};

export const KeyboardControlMovementSystem: SimulationSystem<WorldStepContext> = {
  name: "KeyboardControlMovementSystem",
  dependsOn: ["SteeringForceSystem"],
  reads: ["KeyboardControlTarget", "KeyboardInputState", "CanControl"],
  writes: ["PhysicsVelocity", "BehaviorDecisionState"],
  update(ctx) {
    runKeyboardControlMovementSystem(ctx.components, ctx.physics, ctx.clock);
  },
};
