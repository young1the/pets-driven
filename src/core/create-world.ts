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
import { createStimulusQueue } from "@/features/stimulus/stimulus-queue";
import { runPhysicsTransformSyncSystem } from "@/features/physics/systems";
import {
  describeSimulationSystems,
  runSimulationSystems,
} from "@/core/simulation-system";
import { STEP_SYSTEMS } from "@/core/phases";
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
          pendingReaction: (() => {
            const pr = componentStore.getComponent(entity.id, "PendingReaction");
            return pr ? { source: pr.source, reactsAt: pr.reactsAt } : null;
          })(),
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

  return {
    systems() {
      return STEP_SYSTEMS.map((system) => system.name);
    },
    systemPlan() {
      return describeSimulationSystems(STEP_SYSTEMS);
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
      runSimulationSystems(STEP_SYSTEMS, {
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
