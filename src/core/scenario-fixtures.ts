import type {
  Component,
  PersonalityComponent,
  MovementProfileComponent,
  IdleConversationComponent,
} from "@/core/components";
import {
  DEFAULT_PET_BODY_SIZE,
  DEFAULT_PET_CLIMB_VELOCITY,
  DEFAULT_PET_CONTROL_SPEED,
  DEFAULT_PET_JUMP_IMPULSE,
  DEFAULT_PET_WALK_FORCE,
} from "@/pets/constants/pet-body";
import { DEFAULT_PET_SPEECH } from "@/pets/constants/pet-speech";
import { createManualClock } from "@/shared/time/manual-clock";
import { createWorld } from "@/core/create-world";
import {
  createMonitorBoundaryEntities,
  getWorldViewport,
  type MonitorWorkArea,
} from "@/core/monitor-geometry";

// ─── Personality derivation helpers (exported for testing) ───────────────────

/**
 * Derive movement speeds from OCEAN personality.
 * High E moves faster; high N moves slower (cautious).
 * energy = 0.6 + E×0.5 − N×0.2
 */
export function deriveMovementProfile(
  p: PersonalityComponent,
): MovementProfileComponent {
  const energy = 0.6 + p.extraversion * 0.5 - p.neuroticism * 0.2;
  return {
    type: "MovementProfile",
    idleForce: 0.0005 * energy,
    activeForce: 0.0012 * energy,
    seekForce: 0.0018 * energy,
  };
}

/**
 * Derive idle-speech interval from OCEAN personality.
 * High E → short interval (talkative). Range ≈ 3 s..15 s.
 * interval = 14000 − E×11000 ms
 */
export function deriveIdleConversation(
  p: PersonalityComponent,
): IdleConversationComponent {
  const interval = 14_000 - p.extraversion * 11_000;
  return { type: "IdleConversation", idleAfterMs: Math.round(interval) };
}

// ─── Fixture pet builder ──────────────────────────────────────────────────────

export function createFixturePet(input: {
  id: string;
  sourceId: string;
  name: string;
  x: number;
  y: number;
  components: Component[];
}) {
  // Default personality (may be overridden by input.components).
  const defaultPersonality: PersonalityComponent = {
    type: "Personality",
    openness: 0.5,
    conscientiousness: 0.4,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.2,
  };

  const allComponents: Component[] = [
      { type: "PetIdentity" as const, name: input.name },
      { type: "AgentBinding" as const, sourceId: input.sourceId },
      // MovementProfile is NOT hardcoded here — derived from Personality below.
      { type: "IntentState" as const, intent: "idle" as const },
      {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: null,
      },
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
      { type: "SpeechState" as const, speech: null, expiresAt: null },
      { type: "SpeechProfile" as const, ...DEFAULT_PET_SPEECH },
      { type: "Transform" as const, position: { x: input.x, y: input.y } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        ...DEFAULT_PET_BODY_SIZE,
      },
      { type: "CanDrag" as const },
      { type: "CanControl" as const, speed: DEFAULT_PET_CONTROL_SPEED },
      {
        type: "Perception" as const,
        userAnchor: null,
        nearbyPets: [],
        nearbyClimbables: [],
        self: { grounded: false, climbing: false, intent: "idle" as const },
      },
      // Default personality — per-pet entries in input.components override this.
      defaultPersonality,
      ...input.components,
  ];

  // Post-processing: derive MovementProfile and IdleConversation from the
  // effective Personality (last-write-wins, matching ECS component-store
  // semantics) when no explicit component was provided.
  const effectivePersonality = [...allComponents]
    .reverse()
    .find((c): c is PersonalityComponent => c.type === "Personality");

  const hasMovementProfile = allComponents.some((c) => c.type === "MovementProfile");
  const hasIdleConversation = allComponents.some((c) => c.type === "IdleConversation");

  if (!hasMovementProfile && effectivePersonality) {
    allComponents.push(deriveMovementProfile(effectivePersonality));
  }
  if (!hasIdleConversation && effectivePersonality) {
    allComponents.push(deriveIdleConversation(effectivePersonality));
  }

  return { id: input.id, components: allComponents };
}

export function createDemoScenario(options?: {
  userAnchor?: { x: number; y: number } | null;
  petBodySize?: { width: number; height: number };
  monitorLayout?: "single" | "dual-horizontal";
}) {
  const monitorLayout = options?.monitorLayout ?? "single";
  const clock = createManualClock(0);
  const monitors = resolveMonitorLayout(monitorLayout);
  const viewport = getWorldViewport(monitors);
  const width = viewport.width;
  const height = viewport.height;
  const groundThickness = 48;
  const userAnchor = options?.userAnchor === undefined
    ? defaultUserAnchorForLayout(monitorLayout)
    : options.userAnchor;
  const petBodyComponents: Component[] = options?.petBodySize
    ? [
        {
          type: "PhysicsBody",
          shape: "rectangle",
          width: options.petBodySize.width,
          height: options.petBodySize.height,
        },
      ]
    : [];
  const world = createWorld({
    width,
    height,
    viewport,
    monitors,
    clock,
    entities: [
      ...createMonitorBoundaryEntities(monitors, groundThickness),
      ...(userAnchor
        ? [
            {
              id: "user-anchor",
              components: [
                { type: "UserAnchor" as const },
                {
                  type: "Transform" as const,
                  position: userAnchor,
                },
              ],
            },
          ]
        : []),
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: null },
          { type: "KeyboardInputState", pressedCodes: [], vector: { x: 0, y: 0 } },
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
          ...petBodyComponents,
          { type: "IdleConversation", idleAfterMs: 5_000 },
          { type: "WalkingTag" },
          { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
          { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE * 1 },
          { type: "CanWallClimb", velocity: DEFAULT_PET_CLIMB_VELOCITY },
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
          ...petBodyComponents,
          { type: "WalkingTag" },
          { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
          { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE * 1 },
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
          ...petBodyComponents,
          { type: "WalkingTag" },
          { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
          { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE * 1 },
          { type: "CanWallClimb", velocity: DEFAULT_PET_CLIMB_VELOCITY },
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
          ...petBodyComponents,
          { type: "WalkingTag" },
          { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
          { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE * 1 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          // reserved: high neuroticism, low extraversion
          { type: "Personality", openness: 0.3, conscientiousness: 0.5, extraversion: 0.2, agreeableness: 0.4, neuroticism: 0.75 },
        ],
      }),
      createFixturePet({
        id: "pet-e",
        sourceId: "agent-e",
        name: "Eve",
        x: 420,
        y: 500,
        components: [
          ...petBodyComponents,
          { type: "FlyingTag" },
          { type: "CanFly", gravityScale: 0, hoverStrength: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          { type: "Personality", openness: 0.6, conscientiousness: 0.5, extraversion: 0.6, agreeableness: 0.7, neuroticism: 0.2 },
        ],
      }),
      createFixturePet({
        id: "pet-f",
        sourceId: "agent-f",
        name: "Finn",
        x: 720,
        y: 500,
        components: [
          ...petBodyComponents,
          { type: "FlyingTag" },
          { type: "CanFly", gravityScale: 0, hoverStrength: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          { type: "Personality", openness: 0.4, conscientiousness: 0.7, extraversion: 0.5, agreeableness: 0.6, neuroticism: 0.25 },
        ],
      }),
      createFixturePet({
        id: "pet-g",
        sourceId: "agent-g",
        name: "Gwen",
        x: 120,
        y: 360,
        components: [
          ...petBodyComponents,
          { type: "FlyingTag" },
          { type: "CanFly", gravityScale: 0, hoverStrength: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          { type: "Personality", openness: 0.55, conscientiousness: 0.45, extraversion: 0.65, agreeableness: 0.55, neuroticism: 0.2 },
        ],
      }),
    ],
  });

  return { clock, world };
}

function resolveMonitorLayout(layout: "single" | "dual-horizontal"): MonitorWorkArea[] {
  if (layout === "dual-horizontal") {
    return [
      { id: "left", x: -640, y: 0, width: 640, height: 480 },
      { id: "primary", x: 0, y: 0, width: 960, height: 540 },
    ];
  }

  return [{ id: "monitor", x: 0, y: 0, width: 960, height: 540 }];
}

function defaultUserAnchorForLayout(
  layout: "single" | "dual-horizontal",
): { x: number; y: number } | null {
  if (layout === "dual-horizontal") return null;
  return { x: 480, y: 500 };
}
