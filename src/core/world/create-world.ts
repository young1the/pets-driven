import type {
  ActivityStateComponent,
  AgentBindingComponent,
  CompletionBehaviorComponent,
  IdleConversationComponent,
  IntentStateComponent,
  MotionTargetComponent,
  MovementProfileComponent,
  NavigationStateComponent,
  PetIdentityComponent,
  SimulationComponent,
  SimulationComponentType,
  SpeechProfileComponent,
  SpeechStateComponent,
  TransformComponent,
} from "@/core/components/simulation-components";
import { createComponentStore, type ComponentStore, type EntityDeclaration } from "@/core/ecs/component-store";
import { createMatterPhysicsWorld, type MatterPhysicsWorld } from "@/core/physics/matter-physics-world";
import type { Stimulus } from "@/core/stimuli/stimulus";
import { createStimulusQueue, type StimulusQueue } from "@/core/stimuli/stimulus-queue";
import { runAvoidancePlanningSystem } from "@/core/systems/avoidance-planning-system";
import { runIdleConversationSystem } from "@/core/systems/idle-conversation-system";
import { runIntentSteeringSystem } from "@/core/systems/intent-steering-system";
import { runMotionTargetSystem } from "@/core/systems/motion-target-system";
import { runPhysicsIntegrationSystem, type Force } from "@/core/systems/physics-integration-system";
import { runPhysicsTransformSyncSystem } from "@/core/systems/physics-transform-sync-system";
import { runSimulationSystems, type SimulationSystem } from "@/core/systems/simulation-system";
import { runStimulusReactionSystem } from "@/core/systems/stimulus-reaction-system";
import { createSeededRandom, type RandomSource } from "@/shared/random/seeded-random";
import type { ManualClock } from "@/shared/time/manual-clock";

export type WorldDefinition = {
  width: number;
  height: number;
  clock: ManualClock;
  entities: EntityDeclaration[];
  random?: RandomSource;
};

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
  const physics = createMatterPhysicsWorld({ width: input.width, height: input.height });
  const stimuli = createStimulusQueue();
  const random = input.random ?? createSeededRandom(1);

  registerPhysicsBodies();

  function registerPhysicsBodies() {
    for (const entity of components.query("Transform", "PhysicsBody")) {
      const [transform, body] = entity.components;
      if (body.shape === "rectangle") {
        physics.addRectangle(entity.id, transform.position, {
          width: body.width,
          height: body.height,
        });
      }
    }
  }

  function getReactivePets(componentStore: ComponentStore) {
    return componentStore
      .query("AgentBinding", "IntentState", "SpeechProfile", "SpeechState", "ActivityState", "CompletionBehavior")
      .map((entity) => {
        const [agent, intent, speechProfile, speech, activity, completionBehavior] = entity.components;
        return {
          id: entity.id,
          agent: agent as AgentBindingComponent,
          intent: intent as IntentStateComponent,
          speechProfile: speechProfile as SpeechProfileComponent,
          speech: speech as SpeechStateComponent,
          activity: activity as ActivityStateComponent,
          completionBehavior: completionBehavior as CompletionBehaviorComponent,
        };
      });
  }

  function getIdleConversationPets(componentStore: ComponentStore) {
    return componentStore.query("IdleConversation", "SpeechProfile", "SpeechState", "ActivityState").map((entity) => {
      const [idleConversation, speechProfile, speech, activity] = entity.components;
      return {
        id: entity.id,
        idleConversation: idleConversation as IdleConversationComponent,
        speechProfile: speechProfile as SpeechProfileComponent,
        speech: speech as SpeechStateComponent,
        activity: activity as ActivityStateComponent,
      };
    });
  }

  function getMotionPets(componentStore: ComponentStore) {
    return componentStore.query("IntentState", "MotionTarget").map((entity) => {
      const [intent, motion] = entity.components;
      return {
        id: entity.id,
        intent: intent as IntentStateComponent,
        motion: motion as MotionTargetComponent,
      };
    });
  }

  function getUserAnchorTargets(componentStore: ComponentStore) {
    return componentStore.query("Transform", "UserAnchor").map((entity) => {
      const [transform] = entity.components;
      return {
        id: entity.id,
        transform: transform as TransformComponent,
      };
    });
  }

  function getTransformEntities(componentStore: ComponentStore) {
    return componentStore.query("Transform").map((entity) => {
      const [transform] = entity.components;
      return {
        id: entity.id,
        transform: transform as TransformComponent,
      };
    });
  }

  function getSteeringPets(componentStore: ComponentStore) {
    return componentStore.query("Transform", "MovementProfile", "IntentState", "MotionTarget", "NavigationState").map((entity) => {
      const [transform, movement, intent, motion, navigation] = entity.components;
      return {
        id: entity.id,
        position: (transform as TransformComponent).position,
        movement: movement as MovementProfileComponent,
        intent: intent as IntentStateComponent,
        motion: motion as MotionTargetComponent,
        navigation: navigation as NavigationStateComponent,
      };
    });
  }

  function getNavigatingPets(componentStore: ComponentStore) {
    return componentStore.query("Transform", "MotionTarget", "NavigationState").map((entity) => {
      const [transform, motion, navigation] = entity.components;
      return {
        id: entity.id,
        position: (transform as TransformComponent).position,
        motion: motion as MotionTargetComponent,
        navigation: navigation as NavigationStateComponent,
      };
    });
  }

  function getAvoidanceObstacles(componentStore: ComponentStore) {
    return componentStore.query("Transform", "PhysicsBody").map((entity) => {
      const [transform] = entity.components;
      return {
        id: entity.id,
        position: (transform as TransformComponent).position,
      };
    });
  }

  function getPetSnapshots(componentStore: ComponentStore) {
    return componentStore
      .query("PetIdentity", "AgentBinding", "IntentState", "SpeechState", "Transform")
      .map((entity) => {
        const [identity, agent, intent, speech, transform] = entity.components;

        return {
          id: entity.id,
          sourceId: (agent as AgentBindingComponent).sourceId,
          name: (identity as PetIdentityComponent).name,
          intent: (intent as IntentStateComponent).intent,
          speech: (speech as SpeechStateComponent).speech,
          position: (transform as TransformComponent).position,
        };
      });
  }

  const stepSystems: Array<SimulationSystem<WorldStepContext>> = [
    {
      name: "StimulusReactionSystem",
      update(context) {
        runStimulusReactionSystem(getReactivePets(context.components), context.stimuli.drain());
      },
    },
    {
      name: "IdleConversationSystem",
      update(context) {
        runIdleConversationSystem(getIdleConversationPets(context.components), context.clock);
      },
    },
    {
      name: "PhysicsTransformSyncSystem",
      update(context) {
        runPhysicsTransformSyncSystem(getTransformEntities(context.components), context.physics);
      },
    },
    {
      name: "MotionTargetSystem",
      update(context) {
        runMotionTargetSystem(
          getMotionPets(context.components),
          getUserAnchorTargets(context.components),
          context.random,
          context.bounds,
        );
      },
    },
    {
      name: "AvoidancePlanningSystem",
      update(context) {
        runAvoidancePlanningSystem(
          getNavigatingPets(context.components),
          getAvoidanceObstacles(context.components),
        );
      },
    },
    {
      name: "IntentSteeringSystem",
      update(context) {
        context.forceGroups.push(runIntentSteeringSystem(getSteeringPets(context.components)));
      },
    },
    {
      name: "PhysicsIntegrationSystem",
      update(context) {
        runPhysicsIntegrationSystem({
          physics: context.physics,
          deltaMs: context.deltaMs,
          forceGroups: context.forceGroups,
        });
      },
    },
    {
      name: "PhysicsTransformSyncSystem",
      update(context) {
        runPhysicsTransformSyncSystem(getTransformEntities(context.components), context.physics);
      },
    },
  ];

  return {
    systems() {
      return stepSystems.map((system) => system.name);
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
    pushStimulus(stimulus: Stimulus) {
      stimuli.push(stimulus);
    },
    step(deltaMs: number) {
      runSimulationSystems(stepSystems, {
        deltaMs,
        components,
        physics,
        stimuli,
        clock: input.clock,
        random,
        bounds: {
          width: input.width,
          height: input.height,
        },
        forceGroups: [],
      });
    },
    snapshot() {
      const physicsSnapshot = runPhysicsTransformSyncSystem(getTransformEntities(components), physics);

      return {
        ...physicsSnapshot,
        pets: getPetSnapshots(components),
      };
    },
  };
}
