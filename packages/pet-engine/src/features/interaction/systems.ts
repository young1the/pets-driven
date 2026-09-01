import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import { utteranceChannel } from "@pets-driven/pet-engine/features/agent/components";
import {
  clearMotionTarget,
  isStandingUserClaim,
  setPetSteering,
} from "@pets-driven/pet-engine/features/behavior/claim";
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

/**
 * The world-level entity user input lives on. Exported because the game slice
 * has to ask who the keyboard is steering — a round follows the user's hands
 * rather than storing a separate answer that could disagree with them.
 */
export const INTERACTION_ENTITY_ID = "user-interaction";
const DRAG_START_DISTANCE = 4;
const HIT_TARGET_PADDING = 12;
const MAX_DRAG_SAMPLES = 6;
const THROW_VELOCITY_THRESHOLD = 8;
// Two taps on the same pet within this window count as a double-click, which
// dismisses a settled agent task (waiting/completed) — the same 400ms the pet
// window surface uses for its own double-tap gesture, so the two agree.
const DOUBLE_CLICK_WINDOW_MS = 400;
// Lifetime of the dismissal cue + acknowledge line shown when a double-click
// dismisses a task; mirrors the petting release's SPEECH_BUBBLE_DURATION_MS.
const ACKNOWLEDGE_FEEDBACK_MS = 3000;
// Matter.js has no continuous collision detection, so a body that advances more
// than a wall's thickness (48px, see createMonitorBoundaryEntities) in a single
// 16ms step tunnels straight through and the pet is lost off-screen. Cap the
// per-tick throw speed comfortably below that so even a hard flick stays a
// strong-but-contained throw that hits the wall instead of clearing it.
const MAX_THROW_SPEED = 40;
// The key that hands a steered pet back to itself, alongside the focus loss
// that means the same thing without being typed.
const RELEASE_CODE = "Escape";
// The one vertical the user gets. Steering only moves a pet along the floor;
// leaving the ground is a jump the pet performs, not a direction it is pushed
// in, so this reaches JumpSystem as a request and inherits everything that
// system already decides — grounded-only, landing cooldown, an impulse scaled
// to this body and personality. It is never a direction, so it never enters
// pressedCodes.
const JUMP_CODE = "Space";
// How long the keyboard's hold on a pet outlives the tick that renewed it.
// Renewed every tick the pet is held, so this is only the slack that keeps the
// pet from being re-planned in the gap between two ticks.
const CONTROL_CLAIM_MS = 500;

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
    const controlHit = resolveTarget(components, event, "CanControl");
    const target = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
    if (target) target.entityId = controlHit?.id ?? null;

    const dragHit = resolveTarget(components, event, "CanDrag");
    if (!dragHit) return;

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
    // A press that never crossed the drag threshold (phase stays "pending") is
    // a tap/click. Two such taps on the same pet in quick succession dismiss a
    // settled agent task — the double-click PET-5 asks for.
    const wasTap = drag.phase === "pending";
    const tappedEntityId = drag.entityId;
    components.removeComponent(INTERACTION_ENTITY_ID, "DragInteraction");
    if (wasTap) {
      registerTapAndMaybeRelease(components, tappedEntityId, clock.now(), random);
    }
  }
}

// Records a tap and, when it is the second tap on the same pet within the
// double-click window, dismisses that pet's settled agent task.
function registerTapAndMaybeRelease(
  components: ComponentStore,
  entityId: string,
  now: number,
  random: RandomSource,
): void {
  const tracker = components.getComponent(INTERACTION_ENTITY_ID, "TapGestureState");
  const isDoubleClick =
    tracker?.entityId === entityId && now - tracker.lastTapAt <= DOUBLE_CLICK_WINDOW_MS;

  if (isDoubleClick) {
    // Reset so a third tap starts a fresh gesture rather than chaining.
    components.setComponent(INTERACTION_ENTITY_ID, {
      type: "TapGestureState",
      entityId: null,
      lastTapAt: 0,
    });
    releaseSettledTaskOnDoubleClick(components, entityId, now, random);
    return;
  }

  components.setComponent(INTERACTION_ENTITY_ID, {
    type: "TapGestureState",
    entityId,
    lastTapAt: now,
  });
}

// Double-click dismisses only *settled* work: a waiting or completed task
// clears along with its movement hold and channel badge, confirmed with a
// dismissal beat and the personality acknowledge line. A live "working" task is
// deliberately left alone — per PET-5 it can only be released by stroking the
// pet, so a stray double-click never dismisses a report that is still in
// progress.
//
// The cue deliberately diverges from petting's (PET-23). Petting is the
// affectionate gesture — it comforts the pet — so it keeps the love/heart beat.
// A double-click is not affection: it is the user filing the Attention Hold
// away, so the pet answers with a pleased "noted" (happy/music) instead. Keeping
// both gestures on the heart made the two indistinguishable on screen, which is
// exactly what PET-23 reported; if you are tempted to unify them again, that is
// the regression the acknowledge-cue tests guard against.
function releaseSettledTaskOnDoubleClick(
  components: ComponentStore,
  id: string,
  now: number,
  random: RandomSource,
): void {
  const task = components.getComponent(id, "AgentTaskState");
  if (!task) return;
  if (task.status !== "waiting" && task.status !== "completed") return;

  components.removeComponent(id, "TaskMovementHold");

  const personality = components.getComponent(id, "Personality");
  const feedback = personalityAcknowledgeFeedback(personality?.catalogId, task.status, random);
  components.removeComponent(id, "AgentTaskState");

  const channel = components.getComponent(id, "AgentChannelState");
  if (channel?.source === "agent-task") {
    components.removeComponent(id, "AgentChannelState");
  }

  components.setComponent(id, {
    type: "PetExpressionState",
    source: "acknowledge",
    mood: "happy",
    emote: "music",
    label: null,
    startedAt: now,
    expiresAt: now + ACKNOWLEDGE_FEEDBACK_MS,
  });
  if (feedback) {
    components.setComponent(
      id,
      utteranceChannel({
        message: feedback.speech,
        source: "interaction",
        now,
        durationMs: ACKNOWLEDGE_FEEDBACK_MS,
      }),
    );
  }
  claimUserInteraction(components, id, now, `acknowledge-${task.status}`, ACKNOWLEDGE_FEEDBACK_MS);
  recordPetExperience(components, id, "acknowledged", now);
}

function handleKeyboardEvent(components: ComponentStore, event: KeyboardWorldEvent): void {
  const input = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardInputState");
  if (!input) return;

  // Focus left: nothing can still be held, and nobody is steering any more.
  if (event.type === "keyboard.blur") {
    input.pressedCodes = [];
    input.vector = { x: 0, y: 0 };
    releaseKeyboardControl(components, event.entityId);
    return;
  }

  // The way to hand a pet back to itself. A pet stays the user's from the press
  // that picked it up until it is let go — see runKeyboardControlMovementSystem
  // — so there has to be a key that means "let go", and it never counts as a
  // direction.
  if (event.code === RELEASE_CODE) {
    if (event.type === "keyboard.down") releaseKeyboardControl(components);
    return;
  }

  // Not a direction, so it neither joins pressedCodes nor survives the key-up:
  // one press is one jump, and JumpSystem owns everything after that.
  if (event.code === JUMP_CODE) {
    if (event.type === "keyboard.down") requestKeyboardJump(components);
    return;
  }

  const pressed = new Set(input.pressedCodes);
  if (event.type === "keyboard.down") pressed.add(event.code);
  if (event.type === "keyboard.up") pressed.delete(event.code);

  input.pressedCodes = [...pressed];
  input.vector = keyboardVector(pressed);
}

/**
 * Hand the steered pet back to its own plans. No-op when none is held, or when
 * `onlyEntityId` names a pet that is no longer the one held — see the note on
 * KeyboardFocusLostWorldEvent for why a release can arrive too late to be true.
 */
function releaseKeyboardControl(components: ComponentStore, onlyEntityId?: string): void {
  const target = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
  if (!target) return;
  if (onlyEntityId && target.entityId !== onlyEntityId) return;
  target.entityId = null;
}

/**
 * Ask JumpSystem to launch the steered pet. Only ever a request: whether it
 * leaves the ground, how hard, and what it costs are that system's to decide,
 * the same way an autonomous request-jump behavior asks (see planning-system).
 *
 * Guarded like the approach jump in movement/systems.ts — a live JumpActionState
 * means one is already in flight or cooling down, so a held Space is one jump
 * and not a hover, and a pet that is flying or on a wall is not walking and has
 * no jump to give.
 */
function requestKeyboardJump(components: ComponentStore): void {
  const target = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
  if (!target?.entityId) return;

  const id = target.entityId;
  if (!components.getComponent(id, "WalkingTag")) return;
  if (components.getComponent(id, "FlyingTag") || components.getComponent(id, "ClimbingTag")) {
    return;
  }
  if (components.getComponent(id, "JumpActionState")) return;

  components.setComponent(id, { type: "JumpActionState", phase: "requested", cooldownMs: 0 });
}

/**
 * What this press is on: the entity the sender named, or — failing that — the
 * one under the point.
 *
 * Naming is preferred wherever it is available, and not as an optimisation. A
 * surface that stands for one entity knows which one exactly; `position` is the
 * same fact after a round trip through the host's projection and the window
 * system, and is only as good as that round trip. Where the two disagree the
 * name is right, so a grab stays true however far the projection has drifted —
 * and `grabOffset` is measured from the same `position`, so a drift cancels
 * itself out for the rest of the drag as well.
 *
 * A named entity still has to *have* the capability. Naming says which entity
 * the press was on, never that it may be dragged.
 */
function resolveTarget(
  components: ComponentStore,
  event: PointerWorldEvent,
  capability: "CanDrag" | "CanControl",
): { id: string; position: Vector } | null {
  if (event.entityId) {
    const transform = components.getComponent(event.entityId, "Transform");
    if (!transform) return null;
    if (!components.getComponent(event.entityId, capability)) return null;
    return { id: event.entityId, position: transform.position };
  }

  return hitTest(components, event.position, capability);
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

// Steering is horizontal only: the floor is where a steered pet lives, and the
// one way off it is JUMP_CODE. A vertical axis here was an anti-gravity lift
// no other part of the engine models — it pinned the pet mid-air at a constant
// climb, read as permanently airborne to the animation layer, and came out
// asymmetric because gravity is subtracted going up and added coming down.
function keyboardVector(pressed: Set<string>): Vector {
  const x =
    Number(pressed.has("ArrowRight") || pressed.has("KeyD")) -
    Number(pressed.has("ArrowLeft") || pressed.has("KeyA"));
  return { x, y: 0 };
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
  velocity(id: string): Vector | null;
};

export function runDraggedEntityKinematicSystem(
  components: ComponentStore,
  physics: Pick<KinematicPhysics, "setPosition" | "setVelocity">,
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

/**
 * Drain this tick's ThrowImpulses into the physics bodies.
 *
 * A `"set"` impulse — a throw — replaces the velocity. An `"add"` impulse is a
 * real one: it is summed onto whatever the body is already doing, so the body
 * keeps the momentum it arrived with. The additive result is clamped the same
 * way a throw is, because that ceiling is a tunnelling guard (the boundary
 * walls are 48px thick and nothing behind them does continuous collision), and
 * a sum has no other bound.
 */
export function runThrowImpulseSystem(
  components: ComponentStore,
  physics: Pick<KinematicPhysics, "setVelocity" | "velocity">,
): void {
  components.forEach(["ThrowImpulse"], (id, [throwImpulse]) => {
    components.removeComponent(id, "ThrowImpulse");
    if (throwImpulse.mode !== "add") {
      physics.setVelocity(id, throwImpulse.velocity);
      return;
    }
    const current = physics.velocity(id);
    if (!current) return;
    physics.setVelocity(
      id,
      clampThrowSpeed({
        x: current.x + throwImpulse.velocity.x,
        y: current.y + throwImpulse.velocity.y,
      }),
    );
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

  const now = clock.now();
  // Whatever else the user is doing with this pet right now wins: petting it,
  // dragging it, acknowledging its report. Those are gestures with their own
  // claim and their own beat, and the hold is not in a hurry — it takes the
  // claim back on the tick after they lapse. Nothing the *pet* wants gets in
  // here: only a live user-interaction claim that is not the hold itself.
  const gesture = components.getComponent(target.entityId, "BehaviorDecisionState");
  const heldByAnotherUserGesture =
    gesture?.source === "user-interaction" &&
    !isStandingUserClaim(gesture) &&
    gesture.expiresAt > now;

  // Held for as long as the pet is the user's, not only while a key is down.
  // Between two presses the pet is still theirs, and the claim ladder is the
  // only thing that stops its own planner — or its agent, or another pet
  // wanting to socialize — from taking the body back in that gap and fighting
  // the next press for it. The user lets go with Escape or by clicking away
  // (see handleKeyboardEvent); until then nothing else decides for this pet.
  if (!heldByAnotherUserGesture) {
    claimUserInteraction(components, target.entityId, now, "keyboard-control", CONTROL_CLAIM_MS);
  }

  if (input.vector.x === 0) {
    // Standing where it was put, rather than drifting on. Whatever it was
    // walking toward when it was picked up is dropped here and not once at
    // selection time: it is the last press that decides where the pet waits,
    // and SteeringForceSystem has to be left with nothing to pull it with.
    clearMotionTarget(components, target.entityId);
    setPetSteering(components, target.entityId, "stand");
    physics.setVelocity(target.entityId, { x: 0 });
    return;
  }

  // Horizontal only, and deliberately partial: leaving `y` unset keeps the
  // body on whatever vertical it already had, so gravity, a jump in flight and
  // a fall all carry on underneath the steering instead of being overwritten by
  // it. Steering a pet through the air is the same press as steering it along
  // the floor.
  physics.setVelocity(target.entityId, { x: input.vector.x * canControl.speed });
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
    "TapGestureState",
    "AgentTaskState",
    "AgentChannelState",
    "Personality",
    "WalkingTag",
    "FlyingTag",
    "ClimbingTag",
  ],
  writes: [
    "KeyboardControlTarget",
    "KeyboardInputState",
    "DragInteraction",
    "BehaviorDecisionState",
    "TapGestureState",
    "AgentTaskState",
    "AgentChannelState",
    "TaskMovementHold",
    "PetExpressionState",
    "JumpActionState",
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
  reads: ["ThrowImpulse", "PhysicsVelocity"],
  writes: ["PhysicsVelocity", "ThrowImpulse"],
  update(ctx) {
    runThrowImpulseSystem(ctx.components, ctx.physics);
  },
};

export const KeyboardControlMovementSystem: SimulationSystem<WorldStepContext> = {
  name: "KeyboardControlMovementSystem",
  dependsOn: ["SteeringForceSystem"],
  reads: ["KeyboardControlTarget", "KeyboardInputState", "CanControl"],
  writes: ["PhysicsVelocity", "BehaviorDecisionState", "MotionTarget", "Steering"],
  update(ctx) {
    runKeyboardControlMovementSystem(ctx.components, ctx.physics, ctx.clock);
  },
};
