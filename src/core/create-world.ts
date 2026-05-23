import type {
  SimulationComponent,
  SimulationComponentType,
} from "@/core/components";
import {
  createComponentStore,
  type ComponentStore,
  type EntityDeclaration,
} from "@/core/component-store";
import {
  createMatterPhysicsWorld,
} from "@/features/physics/matter-physics-world";
import type { Stimulus } from "@/features/stimulus/stimulus";
import {
  createStimulusQueue,
  type StimulusQueue,
} from "@/features/stimulus/stimulus-queue";
import {
  runPhysicsTransformSyncSystem,
  runPhysicsIntegrationSystem,
  type Force,
} from "@/features/physics/systems";
import { runContactSystem } from "@/features/contact/systems";
import {
  runLocomotionModeSystem,
  runLocomotionActiveStateSystem,
  runMotionTargetSystem,
  runClimbApproachSystem,
  runClimbDismountSystem,
  runClimbAttachmentSystem,
  runWallClimbSystem,
  runWalkSystem,
  runJumpSystem,
  runIntentSteeringSystem,
  runFlightSystem,
} from "@/features/movement/systems";
import {
  runUserInteractionBehaviorSystem,
  runAgentEventBehaviorSystem,
  runCollisionBehaviorSystem,
  runBehaviorSelectionSystem,
  runAutonomousBehaviorSystem,
  runArrivalBehaviorSystem,
} from "@/features/behavior/systems";
import {
  describeSimulationSystems,
  runSimulationSystems,
  type SimulationSystem,
} from "@/core/simulation-system";
import { SYSTEM_EXECUTION_ORDER } from "@/core/phases";
import {
  createSeededRandom,
  type RandomSource,
} from "@/shared/random/seeded-random";
import type { ManualClock } from "@/shared/time/manual-clock";

export type WorldDefinition = {
  width: number;
  height: number;
  clock: ManualClock;
  entities: EntityDeclaration[];
  random?: RandomSource;
};

type MatterPhysicsWorld = ReturnType<typeof createMatterPhysicsWorld>;

type WorldStepContext = {
  deltaMs: number;
  components: ComponentStore;
  physics: MatterPhysicsWorld;
  stimuli: StimulusQueue;
  clock: ManualClock;
  random: RandomSource;
  bounds: { width: number; height: number };
  forceGroups: Force[][];
};

export function createWorld(input: WorldDefinition) {
  const components = createComponentStore(input.entities);
  const physics = createMatterPhysicsWorld({
    width: input.width,
    height: input.height,
  });
  const stimuli = createStimulusQueue();
  const random = input.random ?? createSeededRandom(1);

  registerPhysicsBodies();

  function registerPhysicsBodies() {
    for (const entity of components.query("Transform", "PhysicsBody")) {
      const [transform, body] = entity.components;
      const material = components.getComponent(entity.id, "PhysicsMaterial");
      if (body.shape === "rectangle") {
        const size = { width: body.width, height: body.height };
        const materialOptions = material
          ? { friction: material.friction, restitution: material.restitution }
          : undefined;

        if (components.getComponent(entity.id, "Ground")) {
          physics.addStaticRectangle(entity.id, transform.position, size, materialOptions);
          continue;
        }
        physics.addRectangle(entity.id, transform.position, size, materialOptions);
      }
    }
  }

  function getPetSnapshots(componentStore: ComponentStore) {
    return componentStore
      .query("PetIdentity", "AgentBinding", "IntentState", "SpeechState", "Transform")
      .map((entity) => {
        const [identity, agent, intent, speech, transform] = entity.components;
        const contactState = componentStore.getComponent(entity.id, "ContactState");
        const decisionState = componentStore.getComponent(entity.id, "BehaviorDecisionState");
        return {
          id: entity.id,
          sourceId: agent.sourceId,
          name: identity.name,
          intent: intent.intent,
          locomotion: getLocomotionLabel(componentStore, entity.id),
          speech: speech.speech,
          position: transform.position,
          contact: {
            grounded: contactState?.grounded ?? false,
            climbableSurfaceId: contactState?.climbableSurfaceId ?? null,
          },
          motionTarget:
            componentStore.getComponent(entity.id, "MotionTarget")?.targetPosition ?? null,
          decision: decisionState
            ? { source: decisionState.source, reason: decisionState.reason, decidedAt: decisionState.decidedAt }
            : null,
        };
      });
  }

  function getLocomotionLabel(componentStore: ComponentStore, id: string) {
    if (componentStore.getComponent(id, "ClimbingState")) return "climb";
    if (componentStore.getComponent(id, "FlyingState")) return "fly";
    return "walk";
  }

  function getClimbableSurfaceSnapshots(componentStore: ComponentStore) {
    return componentStore.query("Transform", "ClimbableSurface").map((entity) => {
      const [transform] = entity.components;
      return { id: entity.id, position: transform.position };
    });
  }

  const stepSystems: Array<SimulationSystem<WorldStepContext>> = [
    // PRE_UPDATE: sync external physics state
    {
      name: "PhysicsTransformSyncSystem",
      reads: ["PhysicsBody"],
      writes: ["Transform"],
      update(ctx) {
        runPhysicsTransformSyncSystem(ctx.components, ctx.physics);
      },
    },
    {
      name: "ContactSystem",
      dependsOn: ["PhysicsTransformSyncSystem"],
      reads: ["Transform", "PhysicsBody", "ContactState", "ClimbableSurface", "Ground"],
      writes: ["ContactState"],
      update(ctx) {
        runContactSystem(ctx.components);
      },
    },

    // BEHAVIOR: priority-ordered decisions (claim/skip model)
    {
      name: "UserInteractionBehaviorSystem",
      dependsOn: ["ContactSystem"],
      reads: [],
      writes: ["BehaviorDecisionState"],
      update(ctx) {
        runUserInteractionBehaviorSystem(ctx.components, ctx.clock);
      },
    },
    {
      name: "AgentEventBehaviorSystem",
      dependsOn: ["UserInteractionBehaviorSystem"],
      reads: ["AgentBinding", "IntentState", "SpeechProfile", "SpeechState", "ActivityState", "CompletionBehavior"],
      writes: ["IntentState", "SpeechState", "ActivityState", "BehaviorDecisionState"],
      update(ctx) {
        runAgentEventBehaviorSystem(ctx.components, ctx.stimuli.drain(), ctx.clock);
      },
    },
    {
      name: "CollisionBehaviorSystem",
      dependsOn: ["AgentEventBehaviorSystem"],
      reads: ["Transform", "PhysicsBody", "IntentState", "MotionTarget"],
      writes: ["MotionTarget", "BehaviorDecisionState"],
      update(ctx) {
        runCollisionBehaviorSystem(ctx.components, ctx.bounds, ctx.clock);
      },
    },
    {
      name: "BehaviorSelectionSystem",
      dependsOn: ["CollisionBehaviorSystem"],
      reads: [
        "IntentState",
        "MotionTarget",
        "Transform",
        "BehaviorPreference",
        "UserAnchor",
        "CanJump",
        "JumpActionState",
        "CanWallClimb",
        "ClimbableSurface",
      ],
      writes: [
        "IntentState",
        "MotionTarget",
        "JumpActionState",
        "ClimbIntentState",
        "BehaviorDecisionState",
      ],
      update(ctx) {
        runBehaviorSelectionSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
      },
    },
    {
      name: "AutonomousBehaviorSystem",
      dependsOn: ["BehaviorSelectionSystem"],
      reads: ["IdleConversation", "SpeechProfile", "SpeechState", "ActivityState"],
      writes: ["SpeechState", "BehaviorDecisionState"],
      update(ctx) {
        runAutonomousBehaviorSystem(ctx.components, ctx.clock);
      },
    },

    // UPDATE: locomotion state transitions and motion target resolution
    {
      name: "LocomotionModeSystem",
      dependsOn: ["AutonomousBehaviorSystem"],
      reads: ["ContactState", "MotionTarget", "WalkingState", "ClimbingState", "FlyingState", "ClimbIntentState", "CanWallClimb", "ClimbDismountState"],
      writes: ["WalkingState", "ClimbingState", "FlyingState"],
      update(ctx) {
        runLocomotionModeSystem(ctx.components);
      },
    },
    {
      name: "ClimbApproachSystem",
      dependsOn: ["LocomotionModeSystem"],
      reads: ["ClimbingState", "Transform", "MotionTarget", "ClimbIntentState", "CanWallClimb", "ClimbableSurface"],
      writes: ["MotionTarget"],
      update(ctx) {
        runClimbApproachSystem(ctx.components);
      },
    },
    {
      name: "ArrivalBehaviorSystem",
      dependsOn: ["ClimbApproachSystem"],
      reads: ["Transform", "MotionTarget", "WandersOnArrival", "IntentState", "ClimbingState", "UserAnchor", "ClimbIntentState"],
      writes: ["MotionTarget", "IntentState"],
      update(ctx) {
        runArrivalBehaviorSystem(ctx.components);
      },
    },
    {
      name: "ClimbDismountSystem",
      dependsOn: ["ArrivalBehaviorSystem"],
      reads: ["ClimbingState", "MotionTarget", "ContactState", "CanWalk", "CanWallClimb", "CanJump", "JumpActionState", "ClimbDismountState", "ClimbIntentState"],
      writes: ["WalkingState", "ClimbingState", "JumpActionState", "ClimbDismountState"],
      update(ctx) {
        runClimbDismountSystem(ctx.components, ctx.deltaMs);
      },
    },
    {
      name: "LocomotionActiveStateSystem",
      dependsOn: ["ClimbDismountSystem"],
      reads: ["ContactState", "WalkingState", "ClimbingState", "FlyingState"],
      writes: ["AirborneState"],
      update(ctx) {
        runLocomotionActiveStateSystem(ctx.components);
      },
    },
    {
      name: "ClimbAttachmentSystem",
      dependsOn: ["LocomotionActiveStateSystem"],
      reads: ["ClimbingState", "ContactState", "Transform", "MotionTarget", "ClimbIntentState"],
      writes: ["Transform", "MotionTarget", "PhysicsPosition", "PhysicsVelocity"],
      update(ctx) {
        runClimbAttachmentSystem(ctx.components, ctx.physics);
      },
    },
    {
      name: "MotionTargetSystem",
      dependsOn: ["ClimbAttachmentSystem"],
      reads: ["IntentState", "MotionTarget", "Transform", "UserAnchor"],
      writes: ["MotionTarget"],
      update(ctx) {
        runMotionTargetSystem(ctx.components, ctx.random, ctx.bounds);
      },
    },

    // POST_UPDATE: force accumulation
    {
      name: "WalkSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: ["Transform", "WalkingState", "ContactState", "CanWalk", "MotionTarget", "NavigationState"],
      writes: ["PhysicsForce"],
      update(ctx) {
        runWalkSystem(ctx.components, ctx.forceGroups);
      },
    },
    {
      name: "JumpSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: ["WalkingState", "ContactState", "CanJump", "JumpActionState"],
      writes: ["PhysicsForce", "JumpActionState"],
      update(ctx) {
        runJumpSystem(ctx.components, ctx.deltaMs, ctx.forceGroups);
      },
    },
    {
      name: "WallClimbSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: ["Transform", "ClimbingState", "CanWallClimb", "MotionTarget", "ContactState"],
      writes: ["PhysicsVelocity"],
      update(ctx) {
        runWallClimbSystem(ctx.components, ctx.physics);
      },
    },
    {
      name: "IntentSteeringSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: ["Transform", "FlyingState", "MovementProfile", "IntentState", "MotionTarget", "NavigationState"],
      writes: ["PhysicsForce"],
      update(ctx) {
        runIntentSteeringSystem(ctx.components, ctx.forceGroups);
      },
    },
    {
      name: "FlightSystem",
      dependsOn: ["IntentSteeringSystem"],
      reads: ["PhysicsBody", "FlyingState", "CanFly"],
      writes: ["PhysicsGravityScale"],
      update(ctx) {
        runFlightSystem(ctx.components, ctx.physics);
      },
    },

    // SIMULATE: physics integration and final position sync
    {
      name: "PhysicsIntegrationSystem",
      dependsOn: ["WalkSystem", "JumpSystem", "WallClimbSystem", "IntentSteeringSystem", "FlightSystem"],
      reads: ["PhysicsForce"],
      writes: ["PhysicsWorld"],
      update(ctx) {
        runPhysicsIntegrationSystem(ctx.physics, ctx.deltaMs, ctx.forceGroups);
      },
    },
    {
      name: "PhysicsTransformSyncSystem",
      dependsOn: ["PhysicsIntegrationSystem"],
      reads: ["PhysicsWorld"],
      writes: ["Transform"],
      update(ctx) {
        runPhysicsTransformSyncSystem(ctx.components, ctx.physics);
      },
    },
  ];

  // Order by phases.ts — SYSTEM_EXECUTION_ORDER is the single source of truth
  // for execution order. Handles duplicate names (e.g. PhysicsTransformSyncSystem
  // appears in both PRE_UPDATE and SIMULATE) by consuming each definition once.
  const byName = new Map<string, Array<SimulationSystem<WorldStepContext>>>();
  for (const s of stepSystems) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name)!.push(s);
  }

  const executionSet = new Set(SYSTEM_EXECUTION_ORDER);
  const orphaned = [...byName.keys()].filter((name) => !executionSet.has(name));
  if (orphaned.length > 0) {
    throw new Error(`Systems implemented but missing from phases.ts: ${orphaned.join(", ")}`);
  }
  const missing = SYSTEM_EXECUTION_ORDER.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Systems declared in phases.ts but not implemented: ${missing.join(", ")}`);
  }

  const orderedSystems = SYSTEM_EXECUTION_ORDER
    .map((name) => byName.get(name)!.shift())
    .filter((s): s is SimulationSystem<WorldStepContext> => s !== undefined);

  return {
    systems() {
      return orderedSystems.map((system) => system.name);
    },
    systemPlan() {
      return describeSimulationSystems(orderedSystems);
    },
    getEntity(id: string) {
      const entity = components.getEntity(id);
      return entity ? { id: entity.id } : undefined;
    },
    getComponent<TType extends SimulationComponentType>(id: string, type: TType) {
      return components.getComponent(id, type);
    },
    setComponent(id: string, component: SimulationComponent) {
      components.setComponent(id, component);
    },
    removeComponent(id: string, type: SimulationComponentType) {
      components.removeComponent(id, type);
    },
    pushStimulus(stimulus: Stimulus) {
      stimuli.push(stimulus);
    },
    step(deltaMs: number) {
      runSimulationSystems(orderedSystems, {
        deltaMs,
        components,
        physics,
        stimuli,
        clock: input.clock,
        random,
        bounds: { width: input.width, height: input.height },
        forceGroups: [],
      });
    },
    snapshot() {
      const physicsSnapshot = runPhysicsTransformSyncSystem(components, physics);
      return {
        ...physicsSnapshot,
        pets: getPetSnapshots(components),
        climbableSurfaces: getClimbableSurfaceSnapshots(components),
      };
    },
  };
}
