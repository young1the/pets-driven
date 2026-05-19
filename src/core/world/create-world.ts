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
import { createComponentStore, type EntityDeclaration } from "@/core/ecs/component-store";
import { createMatterPhysicsWorld } from "@/core/physics/matter-physics-world";
import type { Stimulus } from "@/core/stimuli/stimulus";
import { createStimulusQueue } from "@/core/stimuli/stimulus-queue";
import { runAvoidancePlanningSystem } from "@/core/systems/avoidance-planning-system";
import { runIdleConversationSystem } from "@/core/systems/idle-conversation-system";
import { runIntentSteeringSystem } from "@/core/systems/intent-steering-system";
import { runMotionTargetSystem } from "@/core/systems/motion-target-system";
import { runPhysicsIntegrationSystem } from "@/core/systems/physics-integration-system";
import { runPhysicsTransformSyncSystem } from "@/core/systems/physics-transform-sync-system";
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

  function getReactivePets() {
    return components
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

  function getIdleConversationPets() {
    return components.query("IdleConversation", "SpeechProfile", "SpeechState", "ActivityState").map((entity) => {
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

  function getMotionPets() {
    return components.query("IntentState", "MotionTarget").map((entity) => {
      const [intent, motion] = entity.components;
      return {
        id: entity.id,
        intent: intent as IntentStateComponent,
        motion: motion as MotionTargetComponent,
      };
    });
  }

  function getUserAnchorTargets() {
    return components.query("Transform", "UserAnchor").map((entity) => {
      const [transform] = entity.components;
      return {
        id: entity.id,
        transform: transform as TransformComponent,
      };
    });
  }

  function getTransformEntities() {
    return components.query("Transform").map((entity) => {
      const [transform] = entity.components;
      return {
        id: entity.id,
        transform: transform as TransformComponent,
      };
    });
  }

  function getSteeringPets() {
    return components.query("Transform", "MovementProfile", "IntentState", "MotionTarget", "NavigationState").map((entity) => {
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

  function getNavigatingPets() {
    return components.query("Transform", "MotionTarget", "NavigationState").map((entity) => {
      const [transform, motion, navigation] = entity.components;
      return {
        id: entity.id,
        position: (transform as TransformComponent).position,
        motion: motion as MotionTargetComponent,
        navigation: navigation as NavigationStateComponent,
      };
    });
  }

  function getAvoidanceObstacles() {
    return components.query("Transform", "PhysicsBody").map((entity) => {
      const [transform] = entity.components;
      return {
        id: entity.id,
        position: (transform as TransformComponent).position,
      };
    });
  }

  function getPetSnapshots() {
    return components
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

  return {
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
      runStimulusReactionSystem(getReactivePets(), stimuli.drain());
      runIdleConversationSystem(getIdleConversationPets(), input.clock);

      runPhysicsTransformSyncSystem(getTransformEntities(), physics);
      runMotionTargetSystem(getMotionPets(), getUserAnchorTargets(), random, {
        width: input.width,
        height: input.height,
      });
      runAvoidancePlanningSystem(getNavigatingPets(), getAvoidanceObstacles());
      const intentForces = runIntentSteeringSystem(getSteeringPets());
      runPhysicsIntegrationSystem({
        physics,
        deltaMs,
        forceGroups: [intentForces],
      });
      runPhysicsTransformSyncSystem(getTransformEntities(), physics);
    },
    snapshot() {
      const physicsSnapshot = runPhysicsTransformSyncSystem(getTransformEntities(), physics);

      return {
        ...physicsSnapshot,
        pets: getPetSnapshots(),
      };
    },
  };
}
