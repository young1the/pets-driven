import type { SimulationComponent } from "@/core/components/simulation-components";
import { DEFAULT_PET_BODY_SIZE } from "@/core/constants/pet-body";
import { DEFAULT_PET_SPEECH } from "@/core/constants/pet-speech";
import { createManualClock } from "@/shared/time/manual-clock";
import { createWorld } from "./create-world";

function createFixturePet(input: {
  id: string;
  sourceId: string;
  name: string;
  x: number;
  y: number;
  components: SimulationComponent[];
}) {
  return {
    id: input.id,
    components: [
      { type: "PetIdentity" as const, name: input.name },
      { type: "AgentBinding" as const, sourceId: input.sourceId },
      {
        type: "MovementProfile" as const,
        idleSpeed: 0.0006,
        activeSpeed: 0.0012,
        seekSpeed: 0.0018,
      },
      { type: "IntentState" as const, intent: "idle" as const },
      { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
      { type: "NavigationState" as const, avoidanceWaypoint: null },
      { type: "ActivityState" as const, lastActiveAt: 0 },
      { type: "CompletionBehavior" as const, intentAfterCompletion: "idle" as const },
      { type: "SpeechState" as const, speech: null },
      { type: "SpeechProfile" as const, ...DEFAULT_PET_SPEECH },
      { type: "Transform" as const, position: { x: input.x, y: input.y } },
      { type: "PhysicsBody" as const, shape: "rectangle" as const, ...DEFAULT_PET_BODY_SIZE },
      ...input.components,
    ],
  };
}

export function createDemoScenario(options?: {
  userAnchor?: { x: number; y: number };
}) {
  const clock = createManualClock(0);
  const width = 960;
  const height = 540;
  const groundThickness = 48;
  const world = createWorld({
    width,
    height,
    clock,
    entities: [
      {
        id: "monitor-ground",
        components: [
          { type: "Ground" },
          { type: "Transform", position: { x: width / 2, y: height + groundThickness / 2 } },
          { type: "PhysicsBody", shape: "rectangle", width, height: groundThickness },
          { type: "PhysicsMaterial", friction: 0.8, restitution: 0 },
        ],
      },
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          {
            type: "Transform",
            position: options?.userAnchor ?? { x: 480, y: 500 },
          },
        ],
      },
      createFixturePet({
        id: "pet-a",
        sourceId: "agent-a",
        name: "Alice",
        x: 120,
        y: 500,
        components: [
          { type: "IdleConversation", idleAfterMs: 5_000 },
          { type: "LocomotionState", activeMode: "walk" },
          { type: "WalkMovement", speed: 0.01 },
          { type: "JumpMovement", impulse: 0.014 },
          { type: "WallClimbMovement", speed: 0.004 },
        ],
      }),
      createFixturePet({
        id: "pet-b",
        sourceId: "agent-b",
        name: "Bob",
        x: 200,
        y: 200,
        components: [
          { type: "LocomotionState", activeMode: "fly" },
          { type: "FlightMovement", gravityScale: 0, hoverStrength: 0 },
        ],
      }),
      createFixturePet({
        id: "pet-c",
        sourceId: "agent-c",
        name: "Charlie",
        x: 280,
        y: 200,
        components: [
          { type: "LocomotionState", activeMode: "fly" },
          { type: "FlightMovement", gravityScale: 0, hoverStrength: 0 },
        ],
      }),
    ],
  });

  return { clock, world };
}
