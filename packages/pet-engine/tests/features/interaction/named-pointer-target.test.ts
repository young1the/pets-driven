import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import { runUserInteractionBehaviorSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/**
 * A press can say which entity it landed on, and when it does the interaction
 * system takes its word for it.
 *
 * This is not a shortcut around the hit test — it is the fix for a real failure.
 * A surface that stands for one entity decides "this press is on me" in its own
 * coordinates, where the answer is exact. The `position` on the same event is
 * that fact after a round trip through the host's projection and the window
 * system, and is only ever as good as that round trip: on the desktop a ball's
 * overlay sat 44px from where the world believed it was, so a press on the ball
 * a user could see hit-tested to empty space beside it. Every entity small
 * enough that the drift exceeds its own half-size fails the same way, which is
 * why the small ball broke while the much larger pets did not.
 */

const BALL = { x: 400, y: 500 };
/** As measured on the desktop: the gap between what was pressed and what the
 *  host's projection said was pressed. Larger than the ball's own reach. */
const PROJECTION_DRIFT = 44;

function worldWithABall() {
  return createComponentStore([
    {
      id: "user-interaction",
      components: [
        { type: "KeyboardControlTarget", entityId: null },
        { type: "KeyboardInputState", pressedCodes: [], vector: { x: 0, y: 0 } },
      ],
    },
    {
      id: "prop-ball-0",
      components: [
        { type: "CanDrag" },
        { type: "Transform", position: { ...BALL } },
        { type: "PhysicsBody", shape: "circle", width: 28, height: 28 },
      ],
    },
  ]);
}

function press(
  components: ReturnType<typeof worldWithABall>,
  position: { x: number; y: number },
  entityId?: string,
) {
  const events = createWorldEventQueue();
  events.push({ kind: "pointer", type: "pointer.down", pointerId: 1, at: 0, position, entityId });
  runUserInteractionBehaviorSystem(components, events, createManualClock(0));
  return components.getComponent("user-interaction", "DragInteraction");
}

describe("a press that names its entity", () => {
  it("grabs the named entity even when the projected point misses it", () => {
    const components = worldWithABall();

    const drag = press(components, { x: BALL.x + PROJECTION_DRIFT, y: BALL.y }, "prop-ball-0");

    expect(drag?.entityId).toBe("prop-ball-0");
  });

  it("misses without the name, which is the bug this exists to close", () => {
    const components = worldWithABall();

    expect(press(components, { x: BALL.x + PROJECTION_DRIFT, y: BALL.y })).toBeUndefined();
  });

  it("carries the drift into the grab offset, so the rest of the drag is true", () => {
    const components = worldWithABall();

    const drag = press(components, { x: BALL.x + PROJECTION_DRIFT, y: BALL.y }, "prop-ball-0");

    // DraggedEntityKinematicSystem places the body at pointer + grabOffset, so
    // an offset that absorbs the drift keeps the ball under the cursor for the
    // whole drag rather than snapping it 44px sideways on the first move.
    expect(drag?.grabOffset).toEqual({ x: -PROJECTION_DRIFT, y: 0 });
  });

  it("still refuses an entity that may not be dragged", () => {
    const components = worldWithABall();
    components.removeComponent("prop-ball-0", "CanDrag");

    expect(press(components, { ...BALL }, "prop-ball-0")).toBeUndefined();
  });

  it("refuses a name for an entity that is not in the world", () => {
    const components = worldWithABall();

    expect(press(components, { ...BALL }, "prop-ball-gone")).toBeUndefined();
  });

  it("falls back to the hit test when nobody named anything", () => {
    const components = worldWithABall();

    expect(press(components, { ...BALL })?.entityId).toBe("prop-ball-0");
  });
});
