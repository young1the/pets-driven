import type { SimulationComponent } from "@/core/components";
import { DEFAULT_PET_BODY_SIZE } from "@/pets/constants/pet-body";
import { DEFAULT_PET_SPEECH } from "@/pets/constants/pet-speech";
import { createManualClock } from "@/shared/time/manual-clock";
import { createWorld } from "@/core/create-world";

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
      {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: null,
      },
      { type: "NavigationState" as const, avoidanceWaypoint: null },
      {
        type: "ContactState" as const,
        grounded: false,
        climbableSurfaceId: null,
        climbableSurfacePosition: null,
      },
      { type: "ActivityState" as const, lastActiveAt: 0 },
      {
        type: "CompletionBehavior" as const,
        intentAfterCompletion: "idle" as const,
      },
      { type: "SpeechState" as const, speech: null },
      { type: "SpeechProfile" as const, ...DEFAULT_PET_SPEECH },
      { type: "Transform" as const, position: { x: input.x, y: input.y } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        ...DEFAULT_PET_BODY_SIZE,
      },
      {
        type: "Perception" as const,
        userAnchor: null,
        nearbyPets: [],
        nearbyClimbables: [],
        self: { grounded: false, climbing: false, intent: "idle" as const },
      },
      // Default personality — per-pet entries in input.components override this.
      {
        type: "Personality" as const,
        openness: 0.5,
        conscientiousness: 0.4,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.2,
      },
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
          {
            type: "Transform",
            position: { x: width / 2, y: height + groundThickness / 2 },
          },
          {
            type: "PhysicsBody",
            shape: "rectangle",
            width,
            height: groundThickness,
          },
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
      {
        id: "alice-climb-wall",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 120, y: 500 } },
        ],
      },
      {
        id: "climb-wall",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 280, y: 200 } },
        ],
      },
      createFixturePet({
        id: "pet-a",
        sourceId: "agent-a",
        name: "Alice",
        x: 600,
        y: 500,
        components: [
          { type: "IdleConversation", idleAfterMs: 5_000 },
          { type: "WalkingState" },
          { type: "CanWalk", speed: 0.01 },
          { type: "CanJump", impulse: 0.009 },
          { type: "JumpActionState", phase: "ready", cooldownMs: 0 },
          { type: "CanWallClimb", speed: 1.1 },
          { type: "ClimbDismountState", phase: "ready", cooldownMs: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          // playful: high openness + extraversion, low neuroticism
          { type: "Personality", openness: 0.7, conscientiousness: 0.4, extraversion: 0.85, agreeableness: 0.5, neuroticism: 0.1 },
        ],
      }),
      createFixturePet({
        id: "pet-b",
        sourceId: "agent-b",
        name: "Bob",
        x: 840,
        y: 500,
        components: [
          { type: "WalkingState" },
          { type: "CanWalk", speed: 0.01 },
          { type: "CanJump", impulse: 0.009 },
          { type: "JumpActionState", phase: "requested", cooldownMs: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          // attentive: high extraversion + agreeableness
          { type: "Personality", openness: 0.3, conscientiousness: 0.6, extraversion: 0.8, agreeableness: 0.8, neuroticism: 0.2 },
        ],
      }),
      createFixturePet({
        id: "pet-c",
        sourceId: "agent-c",
        name: "Charlie",
        x: 280,
        y: 200,
        components: [
          { type: "WalkingState" },
          { type: "CanWalk", speed: 0.01 },
          { type: "CanWallClimb", speed: 1.1 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          // playful + climb tendency: high openness + extraversion
          { type: "Personality", openness: 0.7, conscientiousness: 0.4, extraversion: 0.85, agreeableness: 0.5, neuroticism: 0.1 },
        ],
      }),
      createFixturePet({
        id: "pet-d",
        sourceId: "agent-d",
        name: "Dana",
        x: 200,
        y: 200,
        components: [
          { type: "FlyingState" },
          { type: "CanFly", gravityScale: 0, hoverStrength: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          // reserved: high neuroticism, low extraversion
          { type: "Personality", openness: 0.3, conscientiousness: 0.5, extraversion: 0.2, agreeableness: 0.4, neuroticism: 0.75 },
        ],
      }),
    ],
  });

  return { clock, world };
}
