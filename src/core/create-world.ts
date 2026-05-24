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
} from "@/features/stimulus/stimulus-queue";
import { runPhysicsTransformSyncSystem } from "@/features/physics/systems";
import {
  PhysicsTransformSyncSystemPre,
  PhysicsTransformSyncSystemPost,
  PhysicsIntegrationSystem,
} from "@/features/physics/systems";
import { ContactSystem } from "@/features/contact/systems";
import {
  LocomotionModeSystem,
  ClimbApproachSystem,
  ClimbDismountSystem,
  LocomotionActiveStateSystem,
  ClimbAttachmentSystem,
  MotionTargetSystem,
  WalkSystem,
  JumpSystem,
  WallClimbSystem,
  IntentSteeringSystem,
  FlightSystem,
} from "@/features/movement/systems";
import {
  UserInteractionBehaviorSystem,
  AgentEventBehaviorSystem,
  CollisionBehaviorSystem,
  BehaviorSelectionSystem,
  AutonomousBehaviorSystem,
  ArrivalBehaviorSystem,
} from "@/features/behavior/systems";
import {
  describeSimulationSystems,
  runSimulationSystems,
  type SimulationSystem,
} from "@/core/simulation-system";
import { SYSTEM_EXECUTION_ORDER } from "@/core/phases";
import type { WorldStepContext } from "@/core/world-step-context";
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

  // Single source of truth for the per-tick pipeline. Each entry is a
  // descriptor exported by its own feature module; the order here is purely
  // for readability and is reconciled against phases.ts below.
  const stepSystems: Array<SimulationSystem<WorldStepContext>> = [
    // PRE_UPDATE
    PhysicsTransformSyncSystemPre,
    ContactSystem,

    // BEHAVIOR
    UserInteractionBehaviorSystem,
    AgentEventBehaviorSystem,
    CollisionBehaviorSystem,
    BehaviorSelectionSystem,
    AutonomousBehaviorSystem,

    // UPDATE
    LocomotionModeSystem,
    ClimbApproachSystem,
    ArrivalBehaviorSystem,
    ClimbDismountSystem,
    LocomotionActiveStateSystem,
    ClimbAttachmentSystem,
    MotionTargetSystem,

    // POST_UPDATE
    WalkSystem,
    JumpSystem,
    WallClimbSystem,
    IntentSteeringSystem,
    FlightSystem,

    // SIMULATE
    PhysicsIntegrationSystem,
    PhysicsTransformSyncSystemPost,
  ];

  // Reconcile against phases.ts. Each system name must appear exactly once in
  // both stepSystems and SYSTEM_EXECUTION_ORDER — mismatches surface here
  // instead of as silent ordering drift at runtime.
  const byName = new Map<string, SimulationSystem<WorldStepContext>>();
  for (const s of stepSystems) {
    if (byName.has(s.name)) {
      throw new Error(`Duplicate system descriptor: ${s.name}`);
    }
    byName.set(s.name, s);
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

  const orderedSystems = SYSTEM_EXECUTION_ORDER.map((name) => byName.get(name)!);

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
