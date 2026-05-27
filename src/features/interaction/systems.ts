import type { ComponentStore } from "@/core/component-store";
import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import type {
  KeyboardWorldEvent,
  PointerWorldEvent,
} from "@/features/events/world-event";
import type { WorldEventQueue } from "@/features/events/world-event-queue";
import type { Vector } from "@/features/physics/components";
import type { Clock } from "@/shared/time/manual-clock";

const INTERACTION_ENTITY_ID = "user-interaction";
const DRAG_START_DISTANCE = 4;
const MAX_DRAG_SAMPLES = 6;

export function runUserInteractionBehaviorSystem(
  components: ComponentStore,
  events: WorldEventQueue,
  clock: Clock,
): void {
  const inputEvents = events.drainWhere(
    (event): event is PointerWorldEvent | KeyboardWorldEvent =>
      event.kind === "pointer" || event.kind === "keyboard",
  );

  for (const event of inputEvents) {
    if (event.kind === "pointer") handlePointerEvent(components, event, clock);
    if (event.kind === "keyboard") handleKeyboardEvent(components, event);
  }
}

function handlePointerEvent(
  components: ComponentStore,
  event: PointerWorldEvent,
  clock: Clock,
): void {
  if (event.type === "pointer.down") {
    const controlHit = hitTest(components, event.position, "CanControl");
    const target = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
    if (target) target.entityId = controlHit?.id ?? null;

    const dragHit = hitTest(components, event.position, "CanDrag");
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
    components.removeComponent(INTERACTION_ENTITY_ID, "DragInteraction");
  }
}

function handleKeyboardEvent(
  components: ComponentStore,
  event: KeyboardWorldEvent,
): void {
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
    const halfW = body.width / 2;
    const halfH = body.height / 2;
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
  ],
  writes: [
    "KeyboardControlTarget",
    "KeyboardInputState",
    "DragInteraction",
    "BehaviorDecisionState",
  ],
  update(ctx) {
    runUserInteractionBehaviorSystem(ctx.components, ctx.events, ctx.clock);
  },
};
