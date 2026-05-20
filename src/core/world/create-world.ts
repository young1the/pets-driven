import type {
  ActivityStateComponent,
  AgentBindingComponent,
  CompletionBehaviorComponent,
  FlightMovementComponent,
  IdleConversationComponent,
  IntentStateComponent,
  JumpMovementComponent,
  LocomotionStateComponent,
  MotionTargetComponent,
  MovementProfileComponent,
  NavigationStateComponent,
  PetIdentityComponent,
  SimulationComponent,
  SimulationComponentType,
  SpeechProfileComponent,
  SpeechStateComponent,
  TransformComponent,
  WallClimbMovementComponent,
  WalkMovementComponent,
} from "@/core/components/simulation-components";
import { createComponentStore, type ComponentStore, type EntityDeclaration } from "@/core/ecs/component-store";
import { createMatterPhysicsWorld, type MatterPhysicsWorld } from "@/core/physics/matter-physics-world";
import type { Stimulus } from "@/core/stimuli/stimulus";
import { createStimulusQueue, type StimulusQueue } from "@/core/stimuli/stimulus-queue";
import { runAvoidancePlanningSystem } from "@/core/systems/avoidance-planning-system";
import { runFlightSystem } from "@/core/systems/flight-system";
import { runIdleConversationSystem } from "@/core/systems/idle-conversation-system";
import { runIntentSteeringSystem } from "@/core/systems/intent-steering-system";
import { runJumpSystem } from "@/core/systems/jump-system";
import { runMotionTargetSystem } from "@/core/systems/motion-target-system";
import { runPhysicsIntegrationSystem, type Force } from "@/core/systems/physics-integration-system";
import { runPhysicsTransformSyncSystem } from "@/core/systems/physics-transform-sync-system";
import {
  describeSimulationSystems,
  runSimulationSystems,
  type SimulationSystem,
} from "@/core/systems/simulation-system";
import { runStimulusReactionSystem } from "@/core/systems/stimulus-reaction-system";
import { runWalkSystem } from "@/core/systems/walk-system";
import { runWallClimbSystem } from "@/core/systems/wall-climb-system";
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
      const material = components.getComponent(entity.id, "PhysicsMaterial");
      if (body.shape === "rectangle") {
        const size = {
          width: body.width,
          height: body.height,
        };
        const materialOptions = material
          ? {
              friction: material.friction,
              restitution: material.restitution,
            }
          : undefined;

        if (components.getComponent(entity.id, "Ground")) {
          physics.addStaticRectangle(entity.id, transform.position, size, materialOptions);
          continue;
        }

        physics.addRectangle(entity.id, transform.position, size, materialOptions);
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
    return componentStore
      .query("Transform", "LocomotionState", "MovementProfile", "IntentState", "MotionTarget", "NavigationState")
      .flatMap((entity) => {
        const [transform, locomotion, movement, intent, motion, navigation] = entity.components;
        if ((locomotion as LocomotionStateComponent).activeMode !== "fly") {
          return [];
        }

        return [
          {
            id: entity.id,
            position: (transform as TransformComponent).position,
            movement: movement as MovementProfileComponent,
            intent: intent as IntentStateComponent,
            motion: motion as MotionTargetComponent,
            navigation: navigation as NavigationStateComponent,
          },
        ];
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

  function getFlightEntities(componentStore: ComponentStore) {
    return componentStore.query("PhysicsBody", "LocomotionState", "FlightMovement").map((entity) => {
      const [, locomotion, flight] = entity.components;
      return {
        id: entity.id,
        locomotion: locomotion as LocomotionStateComponent,
        flight: flight as FlightMovementComponent,
      };
    });
  }

  function getWalkingEntities(componentStore: ComponentStore) {
    return componentStore
      .query("Transform", "LocomotionState", "WalkMovement", "MotionTarget", "NavigationState")
      .map((entity) => {
        const [transform, locomotion, walk, motion, navigation] = entity.components;
        return {
          id: entity.id,
          position: (transform as TransformComponent).position,
          locomotion: locomotion as LocomotionStateComponent,
          walk: walk as WalkMovementComponent,
          motion: motion as MotionTargetComponent,
          navigation: navigation as NavigationStateComponent,
        };
      });
  }

  function getJumpingEntities(componentStore: ComponentStore) {
    return componentStore.query("LocomotionState", "JumpMovement").map((entity) => {
      const [locomotion, jump] = entity.components;
      return {
        id: entity.id,
        locomotion: locomotion as LocomotionStateComponent,
        jump: jump as JumpMovementComponent,
      };
    });
  }

  function getWallClimbingEntities(componentStore: ComponentStore) {
    return componentStore.query("Transform", "LocomotionState", "WallClimbMovement", "MotionTarget").map((entity) => {
      const [transform, locomotion, wallClimb, motion] = entity.components;
      return {
        id: entity.id,
        position: (transform as TransformComponent).position,
        locomotion: locomotion as LocomotionStateComponent,
        wallClimb: wallClimb as WallClimbMovementComponent,
        motion: motion as MotionTargetComponent,
      };
    });
  }

  function getPetSnapshots(componentStore: ComponentStore) {
    return componentStore
      .query("PetIdentity", "AgentBinding", "IntentState", "LocomotionState", "SpeechState", "Transform")
      .map((entity) => {
        const [identity, agent, intent, locomotion, speech, transform] = entity.components;

        return {
          id: entity.id,
          sourceId: (agent as AgentBindingComponent).sourceId,
          name: (identity as PetIdentityComponent).name,
          intent: (intent as IntentStateComponent).intent,
          locomotion: (locomotion as LocomotionStateComponent).activeMode,
          speech: (speech as SpeechStateComponent).speech,
          position: (transform as TransformComponent).position,
        };
      });
  }

  const stepSystems: Array<SimulationSystem<WorldStepContext>> = [
    {
      name: "StimulusReactionSystem",
      reads: ["AgentBinding", "IntentState", "SpeechProfile", "SpeechState", "ActivityState", "CompletionBehavior"],
      writes: ["IntentState", "SpeechState", "ActivityState"],
      update(context) {
        runStimulusReactionSystem(getReactivePets(context.components), context.stimuli.drain());
      },
    },
    {
      name: "IdleConversationSystem",
      reads: ["IdleConversation", "SpeechProfile", "SpeechState", "ActivityState"],
      writes: ["SpeechState"],
      update(context) {
        runIdleConversationSystem(getIdleConversationPets(context.components), context.clock);
      },
    },
    {
      name: "PhysicsTransformSyncSystem",
      reads: ["PhysicsBody"],
      writes: ["Transform"],
      update(context) {
        runPhysicsTransformSyncSystem(getTransformEntities(context.components), context.physics);
      },
    },
    {
      name: "MotionTargetSystem",
      dependsOn: ["PhysicsTransformSyncSystem"],
      reads: ["IntentState", "MotionTarget", "Transform", "UserAnchor"],
      writes: ["MotionTarget"],
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
      dependsOn: ["MotionTargetSystem"],
      reads: ["Transform", "MotionTarget", "NavigationState", "PhysicsBody"],
      writes: ["NavigationState"],
      update(context) {
        runAvoidancePlanningSystem(
          getNavigatingPets(context.components),
          getAvoidanceObstacles(context.components),
        );
      },
    },
    {
      name: "WalkSystem",
      dependsOn: ["AvoidancePlanningSystem"],
      reads: ["Transform", "LocomotionState", "WalkMovement", "MotionTarget", "NavigationState"],
      writes: ["PhysicsForce"],
      update(context) {
        context.forceGroups.push(runWalkSystem(getWalkingEntities(context.components)));
      },
    },
    {
      name: "JumpSystem",
      dependsOn: ["AvoidancePlanningSystem"],
      reads: ["LocomotionState", "JumpMovement"],
      writes: ["PhysicsForce"],
      update(context) {
        context.forceGroups.push(runJumpSystem(getJumpingEntities(context.components)));
      },
    },
    {
      name: "WallClimbSystem",
      dependsOn: ["AvoidancePlanningSystem"],
      reads: ["Transform", "LocomotionState", "WallClimbMovement", "MotionTarget"],
      writes: ["PhysicsForce"],
      update(context) {
        context.forceGroups.push(runWallClimbSystem(getWallClimbingEntities(context.components)));
      },
    },
    {
      name: "IntentSteeringSystem",
      dependsOn: ["AvoidancePlanningSystem"],
      reads: ["Transform", "LocomotionState", "MovementProfile", "IntentState", "MotionTarget", "NavigationState"],
      writes: ["PhysicsForce"],
      update(context) {
        context.forceGroups.push(runIntentSteeringSystem(getSteeringPets(context.components)));
      },
    },
    {
      name: "FlightSystem",
      dependsOn: ["IntentSteeringSystem"],
      reads: ["PhysicsBody", "LocomotionState", "FlightMovement"],
      writes: ["PhysicsGravityScale"],
      update(context) {
        runFlightSystem(getFlightEntities(context.components), context.physics);
      },
    },
    {
      name: "PhysicsIntegrationSystem",
      dependsOn: ["WalkSystem", "JumpSystem", "WallClimbSystem", "IntentSteeringSystem", "FlightSystem"],
      reads: ["PhysicsForce"],
      writes: ["PhysicsWorld"],
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
      dependsOn: ["PhysicsIntegrationSystem"],
      reads: ["PhysicsWorld"],
      writes: ["Transform"],
      update(context) {
        runPhysicsTransformSyncSystem(getTransformEntities(context.components), context.physics);
      },
    },
  ];

  return {
    systems() {
      return stepSystems.map((system) => system.name);
    },
    systemPlan() {
      return describeSimulationSystems(stepSystems);
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
