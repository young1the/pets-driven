import type {
  Component,
  PersonalityComponent,
  MovementProfileComponent,
  IdleConversationComponent,
  CanJumpComponent,
  CanWalkComponent,
} from "@pets-driven/pet-engine/core/components";
import {
  DEFAULT_PET_BODY_SIZE,
  DEFAULT_PET_CLIMB_VELOCITY,
  DEFAULT_PET_CONTROL_SPEED,
  DEFAULT_PET_FORWARD_JUMP_IMPULSE_MAX,
  DEFAULT_PET_FORWARD_JUMP_IMPULSE_MIN,
  DEFAULT_PET_JUMP_IMPULSE,
  DEFAULT_PET_WALK_FORCE,
} from "@pets-driven/pet-engine/pets/constants/pet-body";
import { DEFAULT_PET_SPEECH } from "@pets-driven/pet-engine/pets/constants/pet-speech";
import { personalitySpeechProfile } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import { initialMoodState } from "@pets-driven/pet-engine/features/mood/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { createWorld } from "@pets-driven/pet-engine/core/create-world";
import type { EntityDeclaration } from "@pets-driven/pet-engine/core/component-store";
import {
  createMonitorBoundaryEntities,
  getWorldViewport,
  type MonitorWorkArea,
} from "@pets-driven/pet-engine/core/monitor-geometry";

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
    standForce: 0.0005 * energy,
    pursueForce: 0.0012 * energy,
    arriveForce: 0.0018 * energy,
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

/**
 * Derive forward jump impulse from OCEAN personality.
 * E raises jump energy; N damps it; O widens the random range; C narrows it.
 */
export function deriveJumpForwardImpulse(
  p: PersonalityComponent,
): NonNullable<CanJumpComponent["forwardImpulse"]> {
  const energy = clamp(
    0.6 + p.extraversion * 0.55 - p.neuroticism * 0.25,
    0.25,
    1.25,
  );
  const variance = clamp(
    0.85 + p.openness * 0.45 - p.conscientiousness * 0.2 - p.neuroticism * 0.1,
    0.6,
    1.35,
  );
  const min = DEFAULT_PET_FORWARD_JUMP_IMPULSE_MIN * energy;
  const max = Math.max(
    min,
    DEFAULT_PET_FORWARD_JUMP_IMPULSE_MAX * energy * variance,
  );

  return {
    min,
    max,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
    { type: "Steering" as const, mode: "stand" as const },
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
      intentAfterCompletion: "stand" as const,
    },
    { type: "SpeechState" as const, speech: null, expiresAt: null },
    { type: "SpeechProfile" as const, ...DEFAULT_PET_SPEECH },
    // Starting drive pressures: a little lonely, fully rested, mildly curious.
    // Per-pet entries in input.components override this (last-write-wins).
    {
      type: "Drives" as const,
      social: 0.3,
      energy: 1.0,
      curiosity: 0.2,
    },
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
      self: { grounded: false, climbing: false, mode: "stand" as const },
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

  const hasMovementProfile = allComponents.some(
    (c) => c.type === "MovementProfile",
  );
  const hasIdleConversation = allComponents.some(
    (c) => c.type === "IdleConversation",
  );
  const hasExplicitSpeechProfile = input.components.some(
    (component) => component.type === "SpeechProfile",
  );

  if (!hasMovementProfile && effectivePersonality) {
    allComponents.push(deriveMovementProfile(effectivePersonality));
  }
  if (!hasIdleConversation && effectivePersonality) {
    allComponents.push(deriveIdleConversation(effectivePersonality));
  }
  if (!hasExplicitSpeechProfile && effectivePersonality?.catalogId) {
    const speechProfile = personalitySpeechProfile(effectivePersonality.catalogId);
    const defaultSpeechIndex = allComponents.findIndex(
      (component) => component.type === "SpeechProfile",
    );
    if (speechProfile && defaultSpeechIndex >= 0) {
      allComponents[defaultSpeechIndex] = speechProfile;
    }
  }
  if (effectivePersonality) {
    if (!allComponents.some((component) => component.type === "MoodState")) {
      allComponents.push(initialMoodState(effectivePersonality));
    }
    if (
      !allComponents.some(
        (component) => component.type === "RecentExperienceMemory",
      )
    ) {
      allComponents.push({ type: "RecentExperienceMemory", entries: [] });
    }
    const forwardImpulse = deriveJumpForwardImpulse(effectivePersonality);
    for (let index = 0; index < allComponents.length; index += 1) {
      const component = allComponents[index];
      if (
        component.type === "CanJump" &&
        component.forwardImpulse === undefined
      ) {
        allComponents[index] = {
          ...component,
          forwardImpulse,
        };
      }
    }
  }

  return { id: input.id, components: allComponents };
}

export function createDemoScenario(options?: {
  userAnchor?: { x: number; y: number } | null;
  petBodySize?: { width: number; height: number };
  monitorLayout?: "single" | "dual-horizontal";
}) {
  const monitorLayout = options?.monitorLayout ?? "single";
  const isDualMonitor = monitorLayout === "dual-horizontal";
  const clock = createManualClock(0);
  const monitors = resolveMonitorLayout(monitorLayout);
  const viewport = getWorldViewport(monitors);
  const width = viewport.width;
  const height = viewport.height;
  const groundThickness = 48;
  const floorPetY = height - 40;
  const userAnchor =
    options?.userAnchor === undefined
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
          {
            type: "KeyboardInputState",
            pressedCodes: [],
            vector: { x: 0, y: 0 },
          },
        ],
      },
      {
        id: "alice-climb-wall",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 120, y: floorPetY } },
        ],
      },
      {
        id: "climb-wall",
        components: [
          { type: "ClimbableSurface" },
          {
            type: "Transform",
            position: isDualMonitor ? { x: 24, y: 840 } : { x: 280, y: 200 },
          },
        ],
      },
      createFixturePet({
        id: "pet-a",
        sourceId: "agent-a",
        name: "Alice",
        x: 600,
        y: floorPetY,
        components: [
          ...petBodyComponents,
          { type: "IdleConversation", idleAfterMs: 5_000 },
          { type: "WalkingTag" },
          { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
          { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE * 1 },
          { type: "CanWallClimb", velocity: DEFAULT_PET_CLIMB_VELOCITY },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          // playful: high openness + extraversion, low neuroticism
          {
            type: "Personality",
            openness: 0.7,
            conscientiousness: 0.4,
            extraversion: 0.85,
            agreeableness: 0.5,
            neuroticism: 0.1,
          },
        ],
      }),
      createFixturePet({
        id: "pet-b",
        sourceId: "agent-b",
        name: "Bob",
        x: isDualMonitor ? 80 : 840,
        y: isDualMonitor ? 1061 : floorPetY,
        components: [
          ...petBodyComponents,
          { type: "WalkingTag" },
          { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
          isDualMonitor
            ? {
                type: "CanJump",
                impulse: DEFAULT_PET_JUMP_IMPULSE * 3.6,
                forwardImpulse: { min: 0.03, max: 0.03 },
              }
            : { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE * 1 },
          ...(isDualMonitor
            ? [
                {
                  type: "MotionTarget" as const,
                  targetEntityId: null,
                  targetPosition: { x: -360, y: 936 },
                },
              ]
            : []),
          { type: "JumpActionState", phase: "requested", cooldownMs: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          // attentive: high extraversion + agreeableness
          {
            type: "Personality",
            openness: 0.3,
            conscientiousness: 0.6,
            extraversion: 0.8,
            agreeableness: 0.8,
            neuroticism: 0.2,
          },
        ],
      }),
      createFixturePet({
        id: "pet-c",
        sourceId: "agent-c",
        name: "Charlie",
        x: isDualMonitor ? 24 : 280,
        y: isDualMonitor ? 840 : 200,
        components: [
          ...petBodyComponents,
          { type: "WalkingTag" },
          ...(isDualMonitor ? [{ type: "ClimbingTag" as const }] : []),
          { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
          { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE * 1 },
          isDualMonitor
            ? {
                type: "CanWallClimb",
                velocity: DEFAULT_PET_CLIMB_VELOCITY * 4,
                // Strong enough that a dismount from the top of the seam wall
                // physically glides across to the left monitor. The previous
                // -0.024 decayed (air friction) into a straight drop; the pet
                // only ever crossed by riding rapid-fire collision reactions,
                // which the per-pair collision cooldown removed by design.
                dismountImpulse: { min: -0.06, max: -0.06 },
              }
            : { type: "CanWallClimb", velocity: DEFAULT_PET_CLIMB_VELOCITY },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          ...(isDualMonitor
            ? [
                { type: "Steering" as const, mode: "pursue" as const },
                {
                  type: "ContactState" as const,
                  grounded: false,
                  climbableSurfaceId: "climb-wall",
                  climbableSurfacePosition: { x: 24, y: 840 },
                },
                {
                  type: "MotionTarget" as const,
                  targetEntityId: null,
                  targetPosition: { x: 24, y: 160 },
                },
                {
                  type: "ClimbIntentState" as const,
                  phase: "attached" as const,
                  surfaceEntityId: "climb-wall",
                  targetY: 160,
                },
              ]
            : []),
          // playful + climb tendency: high openness + extraversion
          {
            type: "Personality",
            openness: 0.7,
            conscientiousness: 0.4,
            extraversion: 0.85,
            agreeableness: 0.5,
            neuroticism: 0.1,
          },
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
          {
            type: "Personality",
            openness: 0.3,
            conscientiousness: 0.5,
            extraversion: 0.2,
            agreeableness: 0.4,
            neuroticism: 0.75,
          },
        ],
      }),
      createFixturePet({
        id: "pet-e",
        sourceId: "agent-e",
        name: "Eve",
        x: 420,
        y: floorPetY,
        components: [
          ...petBodyComponents,
          { type: "FlyingTag" },
          { type: "CanFly", gravityScale: 0, hoverStrength: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Personality",
            openness: 0.6,
            conscientiousness: 0.5,
            extraversion: 0.6,
            agreeableness: 0.7,
            neuroticism: 0.2,
          },
        ],
      }),
      createFixturePet({
        id: "pet-f",
        sourceId: "agent-f",
        name: "Finn",
        x: 720,
        y: floorPetY,
        components: [
          ...petBodyComponents,
          { type: "FlyingTag" },
          { type: "CanFly", gravityScale: 0, hoverStrength: 0 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Personality",
            openness: 0.4,
            conscientiousness: 0.7,
            extraversion: 0.5,
            agreeableness: 0.6,
            neuroticism: 0.25,
          },
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
          {
            type: "Personality",
            openness: 0.55,
            conscientiousness: 0.45,
            extraversion: 0.65,
            agreeableness: 0.55,
            neuroticism: 0.2,
          },
        ],
      }),
    ],
  });

  return { clock, world };
}

/**
 * Derive an adopted pet's mass-tuned locomotion from its rendered body size.
 *
 * Matter.js gives a rectangle body a mass proportional to its area, but
 * DEFAULT_PET_WALK_FORCE / DEFAULT_PET_JUMP_IMPULSE are tuned for the default
 * 32×38 body. A larger adopted body (the desktop app scales the sprite up to
 * ~156×156) is many times heavier, so under the default constants it barely
 * accelerates: it never reaches a wander target, never returns to "idle", and
 * so BehaviorDecisionSystem never even offers a jump candidate — the pet
 * visibly stops jumping. Scale the walk force and jump impulse by the same area
 * ratio so acceleration matches the default body regardless of rendered size.
 *
 * Shared by scenario construction and the desktop host's live resize handler so
 * a pet resized on the fly keeps the same force/impulse tuning it would get from
 * a fresh scenario build. (The jump playground compensates the same way via its
 * explicit impulse multiplier; it builds pets through a separate scenario, so
 * this stays isolated to adopted pets.)
 */
export function deriveAdoptedPetLocomotion(
  bodySize: { width: number; height: number } | undefined,
  personality?: PersonalityComponent,
): { canWalk: CanWalkComponent; canJump: CanJumpComponent; bodyMassScale: number } {
  const bodyMassScale = bodySize
    ? (bodySize.width * bodySize.height) /
      (DEFAULT_PET_BODY_SIZE.width * DEFAULT_PET_BODY_SIZE.height)
    : 1;
  const forwardImpulseBase = personality
    ? deriveJumpForwardImpulse(personality)
    : {
        min: DEFAULT_PET_FORWARD_JUMP_IMPULSE_MIN,
        max: DEFAULT_PET_FORWARD_JUMP_IMPULSE_MAX,
      };
  const canJump: CanJumpComponent = bodySize
    ? {
        type: "CanJump",
        impulse: DEFAULT_PET_JUMP_IMPULSE * bodyMassScale,
        forwardImpulse: {
          min: forwardImpulseBase.min * bodyMassScale,
          max: forwardImpulseBase.max * bodyMassScale,
        },
      }
    : { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE };
  const canWalk: CanWalkComponent = {
    type: "CanWalk",
    force: DEFAULT_PET_WALK_FORCE * bodyMassScale,
  };
  return { canWalk, canJump, bodyMassScale };
}

export type AdoptedPetScenarioInput = {
  id: string;
  name: string;
  sourceId: string;
  personality?: PersonalityComponent;
};

/**
 * Shape a single adopted pet into a world entity declaration: a grounded
 * walker/jumper whose locomotion is derived from its body size and personality.
 * Shared by the initial scenario build and by the live addPet path so a pet
 * added mid-simulation is identical to one present from the start.
 */
export function buildAdoptedPetEntity(
  pet: AdoptedPetScenarioInput,
  options: {
    position: { x: number; y: number };
    bodySize?: { width: number; height: number };
  },
): EntityDeclaration {
  const { bodySize } = options;
  const bodyComponents: Component[] = bodySize
    ? [
        {
          type: "PhysicsBody",
          shape: "rectangle",
          width: bodySize.width,
          height: bodySize.height,
        },
      ]
    : [];
  const { canWalk, canJump } = deriveAdoptedPetLocomotion(
    bodySize,
    pet.personality,
  );
  return createFixturePet({
    id: pet.id,
    sourceId: pet.sourceId,
    name: pet.name,
    x: options.position.x,
    y: options.position.y,
    components: [
      ...bodyComponents,
      { type: "WalkingTag" },
      canWalk,
      canJump,
      { type: "WandersOnArrival", arrivalRadius: 16 },
      { type: "CanSocialize" },
      ...(pet.personality ? [pet.personality] : []),
    ],
  });
}

/**
 * Build a live world seeded with the user's actual adopted pets so they walk,
 * jump and wander on the screen floor exactly like the demo playground pets.
 * Unlike createDemoScenario the roster is dynamic — one grounded walker per
 * adopted pet, evenly spaced, with movement derived from its personality.
 *
 * The returned `addPet`/`removePet` reconcile the roster in place so deploying
 * or sending home one pet never disturbs the others: rebuilding the world would
 * reset every pet's position and animation, which the host must avoid.
 */
export function createAdoptedPetsScenario(
  pets: ReadonlyArray<AdoptedPetScenarioInput>,
  options?: {
    petBodySize?: { width: number; height: number };
    petBodySizeByPetId?: Record<string, { width: number; height: number }>;
    monitors?: MonitorWorkArea[];
    spawnPoint?: { x: number; y: number };
  },
) {
  const clock = createManualClock(0);
  const monitors = options?.monitors ?? resolveMonitorLayout("single");
  const initialPlacementMonitors = orderMonitorsForInitialPlacement(monitors);
  const viewport = getWorldViewport(monitors);
  const groundThickness = 48;

  const bodySizeFor = (petId: string, explicit?: { width: number; height: number }) =>
    explicit ?? options?.petBodySizeByPetId?.[petId] ?? options?.petBodySize;

  const spawnPositionFor = (
    index: number,
    total: number,
    bodySize?: { width: number; height: number },
  ) =>
    options?.spawnPoint ??
    initialPlacementForPet(
      initialPlacementMonitors,
      index,
      total,
      bodySize?.height ?? DEFAULT_PET_BODY_SIZE.height,
    );

  const world = createWorld({
    width: viewport.width,
    height: viewport.height,
    viewport,
    monitors,
    clock,
    entities: [
      ...createMonitorBoundaryEntities(monitors, groundThickness),
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" as const },
          {
            type: "Transform" as const,
            // Placeholder until the host feeds a live cursor position via
            // world.feedCursorPosition() — CursorInputSystem then keeps this
            // Transform (and CursorState) in sync every tick.
            position: {
              x: viewport.x + viewport.width / 2,
              y: viewport.y + viewport.height / 2,
            },
          },
        ],
      },
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: null },
          {
            type: "KeyboardInputState",
            pressedCodes: [],
            vector: { x: 0, y: 0 },
          },
        ],
      },
      ...pets.map((pet, index) => {
        const bodySize = bodySizeFor(pet.id);
        return buildAdoptedPetEntity(pet, {
          position: spawnPositionFor(index, pets.length, bodySize),
          bodySize,
        });
      }),
    ],
  });

  // Running count of live pets, used only as a spawn-slot hint for a pet added
  // later. Never decremented below zero; removals leave gaps that the next add
  // reuses (a spawn hint, not an identity), then the pet wanders off anyway.
  let petCount = pets.length;

  return {
    clock,
    world,
    /**
     * Add one pet to the live world without touching the others. The host calls
     * this when a pet is deployed while at least one pet is already on screen.
     */
    addPet(
      pet: AdoptedPetScenarioInput,
      addOptions?: {
        bodySize?: { width: number; height: number };
        position?: { x: number; y: number };
      },
    ) {
      if (world.getEntity(pet.id)) {
        return;
      }
      const bodySize = bodySizeFor(pet.id, addOptions?.bodySize);
      const position =
        addOptions?.position ?? spawnPositionFor(petCount, petCount + 1, bodySize);
      world.addEntity(buildAdoptedPetEntity(pet, { position, bodySize }));
      petCount += 1;
    },
    /** Remove one pet from the live world; other pets keep their state. */
    removePet(id: string) {
      if (!world.getEntity(id)) {
        return;
      }
      world.removeEntity(id);
      petCount = Math.max(0, petCount - 1);
    },
  };
}

export const JUMP_PLAYGROUND_PET_IDS = [
  "pet-a",
  "pet-b",
  "pet-c",
  "pet-d",
  "pet-e",
  "pet-f",
  "pet-g",
] as const;

const JUMP_PLAYGROUND_PETS = [
  {
    id: "pet-a",
    sourceId: "agent-a",
    name: "Alice",
    wallId: "jump-wall-a",
    x: 200,
    leftX: 160,
    rightX: 240,
    wallX: 32,
    wallTargetX: 128,
    wallHeight: 72,
    impulseMultiplier: 18,
    min: 0.13,
    max: 0.13,
  },
  {
    id: "pet-b",
    sourceId: "agent-b",
    name: "Bob",
    x: 340,
    leftX: 300,
    rightX: 380,
    min: 0.04,
    max: 0.11,
  },
  {
    id: "pet-c",
    sourceId: "agent-c",
    name: "Charlie",
    x: 460,
    leftX: 420,
    rightX: 500,
    min: 0.08,
    max: 0.17,
  },
  {
    id: "pet-d",
    sourceId: "agent-d",
    name: "Dana",
    x: 580,
    leftX: 540,
    rightX: 620,
    min: 0.03,
    max: 0.085,
  },
  {
    id: "pet-e",
    sourceId: "agent-e",
    name: "Eve",
    x: 700,
    leftX: 660,
    rightX: 740,
    min: 0.07,
    max: 0.15,
  },
  {
    id: "pet-f",
    sourceId: "agent-f",
    name: "Finn",
    x: 820,
    leftX: 780,
    rightX: 860,
    min: 0.05,
    max: 0.12,
  },
  {
    id: "pet-g",
    sourceId: "agent-g",
    name: "Gwen",
    x: 920,
    leftX: 880,
    rightX: 936,
    min: 0.09,
    max: 0.19,
  },
] as const;

export function nextJumpPlaygroundTarget(
  petId: (typeof JUMP_PLAYGROUND_PET_IDS)[number],
  currentX: number,
  currentY: number,
) {
  const pet = JUMP_PLAYGROUND_PETS.find((entry) => entry.id === petId);
  if (!pet) return { x: currentX, y: currentY };

  if ("wallX" in pet) {
    const wallTopY = jumpPlaygroundWallTopY(pet.wallHeight);
    const wallCenterTargetY = wallTopY - JUMP_PLAYGROUND_BODY_SIZE.height / 2;
    if (
      Math.abs(currentX - pet.wallTargetX) > 16 ||
      Math.abs(currentY - wallCenterTargetY) > 16
    ) {
      return {
        x: pet.wallTargetX,
        y: wallCenterTargetY,
      };
    }
  }

  const midpoint = (pet.leftX + pet.rightX) / 2;
  return {
    x: currentX <= midpoint ? pet.rightX : pet.leftX,
    y: currentY,
  };
}

const JUMP_PLAYGROUND_BODY_SIZE = { width: 96, height: 114 } as const;
const JUMP_PLAYGROUND_WALL_WIDTH = 192;

function jumpPlaygroundWallTopY(height: number) {
  return 1080 - height;
}

export function createJumpPlaygroundScenario(options?: {
  startJumping?: boolean;
}) {
  const clock = createManualClock(0);
  const monitors = resolveMonitorLayout("single");
  const viewport = getWorldViewport(monitors);
  const groundThickness = 48;
  const y = viewport.height - 64;
  const world = createWorld({
    width: viewport.width,
    height: viewport.height,
    viewport,
    monitors,
    clock,
    entities: [
      ...createMonitorBoundaryEntities(monitors, groundThickness),
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: null },
          {
            type: "KeyboardInputState",
            pressedCodes: [],
            vector: { x: 0, y: 0 },
          },
        ],
      },
      ...JUMP_PLAYGROUND_PETS.filter((pet) => "wallId" in pet).map((pet) => ({
        id: pet.wallId,
        components: [
          { type: "Ground" as const },
          {
            type: "Transform" as const,
            position: { x: pet.wallX, y: viewport.height - pet.wallHeight / 2 },
          },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: JUMP_PLAYGROUND_WALL_WIDTH,
            height: pet.wallHeight,
          },
          { type: "PhysicsMaterial" as const, friction: 0.8, restitution: 0 },
        ],
      })),
      ...JUMP_PLAYGROUND_PETS.map((pet) =>
        createFixturePet({
          id: pet.id,
          sourceId: pet.sourceId,
          name: pet.name,
          x: pet.x,
          y,
          components: [
            {
              type: "PhysicsBody",
              shape: "rectangle",
              ...JUMP_PLAYGROUND_BODY_SIZE,
            },
            {
              type: "PhysicsMaterial",
              friction: 0.1,
              frictionAir: 0.008,
              restitution: 0,
            },
            { type: "WalkingTag" },
            {
              type: "MotionTarget",
              targetEntityId: null,
              targetPosition: nextJumpPlaygroundTarget(pet.id, pet.x, y),
            },
            {
              type: "CanJump",
              impulse:
                DEFAULT_PET_JUMP_IMPULSE *
                ("impulseMultiplier" in pet ? pet.impulseMultiplier : 14),
              forwardImpulse: { min: pet.min, max: pet.max },
            },
            ...(options?.startJumping === false
              ? []
              : [
                  {
                    type: "JumpActionState" as const,
                    phase: "requested" as const,
                    cooldownMs: 0,
                  },
                ]),
            {
              type: "Personality",
              openness: 0.7,
              conscientiousness: 0.35,
              extraversion: 0.85,
              agreeableness: 0.5,
              neuroticism: 0.1,
            },
          ],
        }),
      ),
    ],
  });

  return { clock, world };
}

export const CLIMB_PLAYGROUND_PET_IDS = [
  "pet-a",
  "pet-b",
  "pet-c",
  "pet-d",
  "pet-e",
] as const;

const CLIMB_PLAYGROUND_PETS = [
  {
    id: "pet-a",
    sourceId: "agent-a",
    name: "Alice",
    wallId: "climb-wall-a",
    x: 120,
    startY: 448,
    targetY: 104,
    velocity: 2.0,
    min: 0.04,
    max: 0.09,
  },
  {
    id: "pet-b",
    sourceId: "agent-b",
    name: "Bob",
    wallId: "climb-wall-b",
    x: 300,
    startY: 448,
    targetY: 136,
    velocity: 1.6,
    min: 0.03,
    max: 0.075,
  },
  {
    id: "pet-c",
    sourceId: "agent-c",
    name: "Charlie",
    wallId: "climb-wall-c",
    x: 480,
    startY: 448,
    targetY: 88,
    velocity: 2.3,
    min: 0.05,
    max: 0.11,
  },
  {
    id: "pet-d",
    sourceId: "agent-d",
    name: "Dana",
    wallId: "climb-wall-d",
    x: 660,
    startY: 448,
    targetY: 160,
    velocity: 1.3,
    min: 0.025,
    max: 0.06,
  },
  {
    id: "pet-e",
    sourceId: "agent-e",
    name: "Eve",
    wallId: "climb-wall-e",
    x: 840,
    startY: 448,
    targetY: 112,
    velocity: 1.9,
    min: 0.045,
    max: 0.1,
  },
] as const;

export function createClimbPlaygroundScenario() {
  const clock = createManualClock(0);
  const monitors = resolveMonitorLayout("single");
  const viewport = getWorldViewport(monitors);
  const groundThickness = 48;
  const bodySize = { width: 72, height: 86 };
  const world = createWorld({
    width: viewport.width,
    height: viewport.height,
    viewport,
    monitors,
    clock,
    entities: [
      ...createMonitorBoundaryEntities(monitors, groundThickness),
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: null },
          {
            type: "KeyboardInputState",
            pressedCodes: [],
            vector: { x: 0, y: 0 },
          },
        ],
      },
      ...CLIMB_PLAYGROUND_PETS.map((pet) => ({
        id: pet.wallId,
        components: [
          { type: "ClimbableSurface" as const },
          {
            type: "Transform" as const,
            position: { x: pet.x, y: viewport.height / 2 },
          },
        ],
      })),
      ...CLIMB_PLAYGROUND_PETS.map((pet) =>
        createFixturePet({
          id: pet.id,
          sourceId: pet.sourceId,
          name: pet.name,
          x: pet.x,
          y: pet.startY,
          components: [
            {
              type: "PhysicsBody",
              shape: "rectangle",
              ...bodySize,
            },
            {
              type: "PhysicsMaterial",
              friction: 0.1,
              frictionAir: 0.008,
              restitution: 0,
            },
            { type: "ClimbingTag" },
            { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
            { type: "CanJump", impulse: DEFAULT_PET_JUMP_IMPULSE * 8 },
            {
              type: "CanWallClimb",
              velocity: pet.velocity,
              dismountImpulse: { min: pet.min, max: pet.max },
            },
            { type: "WandersOnArrival", arrivalRadius: 16 },
            { type: "Steering", mode: "pursue" },
            {
              type: "ContactState",
              grounded: false,
              climbableSurfaceId: pet.wallId,
              climbableSurfacePosition: { x: pet.x, y: viewport.height / 2 },
            },
            {
              type: "MotionTarget",
              targetEntityId: null,
              targetPosition: { x: pet.x, y: pet.targetY },
            },
            {
              type: "ClimbIntentState",
              phase: "attached",
              surfaceEntityId: pet.wallId,
              targetY: pet.targetY,
            },
            {
              type: "Personality",
              openness: 0.7,
              conscientiousness: 0.35,
              extraversion: 0.8,
              agreeableness: 0.5,
              neuroticism: 0.15,
            },
          ],
        }),
      ),
    ],
  });

  return { clock, world };
}

function resolveMonitorLayout(
  layout: "single" | "dual-horizontal",
): MonitorWorkArea[] {
  if (layout === "dual-horizontal") {
    return [
      { id: "left", x: -1280, y: 0, width: 1280, height: 960 },
      { id: "primary", x: 0, y: 0, width: 1920, height: 1080 },
    ];
  }

  return [{ id: "monitor", x: 0, y: 0, width: 1920, height: 1080 }];
}

function orderMonitorsForInitialPlacement(
  monitors: MonitorWorkArea[],
): MonitorWorkArea[] {
  return [...monitors].sort(
    (a, b) => monitorOriginDistance(a) - monitorOriginDistance(b),
  );
}

function monitorOriginDistance(monitor: MonitorWorkArea): number {
  if (containsDesktopOrigin(monitor)) {
    return -1;
  }

  const nearestX = clamp(0, monitor.x, monitor.x + monitor.width);
  const nearestY = clamp(0, monitor.y, monitor.y + monitor.height);

  return Math.hypot(nearestX, nearestY);
}

function containsDesktopOrigin(monitor: MonitorWorkArea): boolean {
  return (
    monitor.x <= 0 &&
    0 < monitor.x + monitor.width &&
    monitor.y <= 0 &&
    0 < monitor.y + monitor.height
  );
}

function initialPlacementForPet(
  monitors: MonitorWorkArea[],
  index: number,
  totalPets: number,
  bodyHeight: number,
) {
  const monitorIndex = index % monitors.length;
  const monitor = monitors[monitorIndex];
  const slotIndex = Math.floor(index / monitors.length);
  const slotsOnMonitor = Math.ceil((totalPets - monitorIndex) / monitors.length);

  return {
    x: monitor.x + (monitor.width * (slotIndex + 1)) / (slotsOnMonitor + 1),
    y: monitor.y + monitor.height - bodyHeight / 2,
  };
}

function defaultUserAnchorForLayout(
  layout: "single" | "dual-horizontal",
): { x: number; y: number } | null {
  if (layout === "dual-horizontal") return null;
  return { x: 480, y: 1040 };
}
