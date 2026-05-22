import type {
  ActivityStateComponent,
  AgentBindingComponent,
  ClimbDismountStateComponent,
  ContactStateComponent,
  CompletionBehaviorComponent,
  CanFlyComponent,
  IdleConversationComponent,
  IntentStateComponent,
  CanJumpComponent,
  JumpActionStateComponent,
  LocomotionStateComponent,
  MotionTargetComponent,
  MovementProfileComponent,
  NavigationStateComponent,
  PhysicsBodyComponent,
  PetIdentityComponent,
  SimulationComponent,
  SimulationComponentType,
  SpeechProfileComponent,
  SpeechStateComponent,
  TransformComponent,
  WandersOnArrivalComponent,
  CanWallClimbComponent,
  CanWalkComponent,
} from "@/core/components/simulation-components";
import {
  createComponentStore,
  type ComponentStore,
  type EntityDeclaration,
} from "@/core/ecs/component-store";
import {
  createMatterPhysicsWorld,
  type MatterPhysicsWorld,
} from "@/core/physics/matter-physics-world";
import type { Stimulus } from "@/core/stimuli/stimulus";
import {
  createStimulusQueue,
  type StimulusQueue,
} from "@/core/stimuli/stimulus-queue";
import { runArrivalBehaviorSystem } from "@/core/systems/arrival-behavior-system";
import { runClimbAttachmentSystem } from "@/core/systems/climb-attachment-system";
import { runClimbDismountSystem } from "@/core/systems/climb-dismount-system";
import { runCollisionReactionSystem } from "@/core/systems/collision-reaction-system";
import { runContactSystem } from "@/core/systems/contact-system";
import { runLocomotionActiveStateSystem } from "@/core/systems/locomotion-active-state-system";
import { runLocomotionModeSystem } from "@/core/systems/locomotion-mode-system";
import { runFlightSystem } from "@/core/systems/flight-system";
import { runIdleConversationSystem } from "@/core/systems/idle-conversation-system";
import { runIntentSteeringSystem } from "@/core/systems/intent-steering-system";
import { runJumpSystem } from "@/core/systems/jump-system";
import { runMotionTargetSystem } from "@/core/systems/motion-target-system";
import {
  runPhysicsIntegrationSystem,
  type Force,
} from "@/core/systems/physics-integration-system";
import { runPhysicsTransformSyncSystem } from "@/core/systems/physics-transform-sync-system";
import {
  describeSimulationSystems,
  runSimulationSystems,
  type SimulationSystem,
} from "@/core/systems/simulation-system";
import { runStimulusReactionSystem } from "@/core/systems/stimulus-reaction-system";
import { runWalkSystem } from "@/core/systems/walk-system";
import { runWallClimbSystem } from "@/core/systems/wall-climb-system";
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
          physics.addStaticRectangle(
            entity.id,
            transform.position,
            size,
            materialOptions,
          );
          continue;
        }

        physics.addRectangle(
          entity.id,
          transform.position,
          size,
          materialOptions,
        );
      }
    }
  }

  function getReactivePets(componentStore: ComponentStore) {
    return componentStore
      .query(
        "AgentBinding",
        "IntentState",
        "SpeechProfile",
        "SpeechState",
        "ActivityState",
        "CompletionBehavior",
      )
      .map((entity) => {
        const [
          agent,
          intent,
          speechProfile,
          speech,
          activity,
          completionBehavior,
        ] = entity.components;
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
    return componentStore
      .query(
        "IdleConversation",
        "SpeechProfile",
        "SpeechState",
        "ActivityState",
      )
      .map((entity) => {
        const [idleConversation, speechProfile, speech, activity] =
          entity.components;
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

  function getArrivalBehaviorEntities(componentStore: ComponentStore) {
    return componentStore
      .query("IntentState", "LocomotionState", "Transform", "MotionTarget", "WandersOnArrival")
      .map((entity) => {
        const [intent, locomotion, transform, motion, wandersOnArrival] = entity.components;
        return {
          intent: intent as IntentStateComponent,
          locomotion: locomotion as LocomotionStateComponent,
          transform: transform as TransformComponent,
          motion: motion as MotionTargetComponent,
          wandersOnArrival: wandersOnArrival as WandersOnArrivalComponent,
        };
      });
  }

  function getAnchorPositions(componentStore: ComponentStore) {
    return componentStore.query("UserAnchor", "Transform").map((entity) => {
      const [, transform] = entity.components;
      return {
        id: entity.id,
        position: (transform as TransformComponent).position,
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

  function getContactEntities(componentStore: ComponentStore) {
    return componentStore
      .query("Transform", "PhysicsBody", "ContactState")
      .map((entity) => {
        const [transform, body, contact] = entity.components;
        return {
          id: entity.id,
          position: (transform as TransformComponent).position,
          body: body as PhysicsBodyComponent,
          contact: contact as ContactStateComponent,
        };
      });
  }

  function getGroundSurfaces(componentStore: ComponentStore) {
    return componentStore.query("Transform", "PhysicsBody", "Ground").map((entity) => {
      const [transform, body] = entity.components;
      return {
        id: entity.id,
        position: (transform as TransformComponent).position,
        size: {
          width: (body as PhysicsBodyComponent).width,
          height: (body as PhysicsBodyComponent).height,
        },
      };
    });
  }

  function getClimbableSurfaces(componentStore: ComponentStore) {
    return componentStore
      .query("Transform", "ClimbableSurface")
      .map((entity) => {
        const [transform] = entity.components;
        return {
          id: entity.id,
          position: (transform as TransformComponent).position,
        };
      });
  }

  function getClimbableSurfaceSnapshots(componentStore: ComponentStore) {
    return getClimbableSurfaces(componentStore).map((surface) => ({
      id: surface.id,
      position: surface.position,
    }));
  }

  function getLocomotionModeEntities(componentStore: ComponentStore) {
    return componentStore
      .query("LocomotionState", "ContactState", "MotionTarget")
      .map((entity) => {
        const [locomotion, contact, motion] = entity.components;
        return {
          id: entity.id,
          locomotion: locomotion as LocomotionStateComponent,
          contact: contact as ContactStateComponent,
          motion: motion as MotionTargetComponent,
          wallClimb:
            (componentStore.getComponent(
              entity.id,
              "CanWallClimb",
            ) as CanWallClimbComponent) ?? null,
          climbDismount:
            (componentStore.getComponent(
              entity.id,
              "ClimbDismountState",
            ) as ClimbDismountStateComponent) ?? null,
        };
      });
  }

  function getClimbDismountEntities(componentStore: ComponentStore) {
    return componentStore
      .query(
        "LocomotionState",
        "MotionTarget",
        "ContactState",
        "CanWalk",
        "CanWallClimb",
        "CanJump",
        "JumpActionState",
        "ClimbDismountState",
      )
      .map((entity) => {
        const [
          locomotion,
          motion,
          contact,
          walk,
          wallClimb,
          jump,
          jumpAction,
          climbDismount,
        ] = entity.components;
        return {
          id: entity.id,
          locomotion: locomotion as LocomotionStateComponent,
          motion: motion as MotionTargetComponent,
          contact: contact as ContactStateComponent,
          walk: walk as CanWalkComponent,
          wallClimb: wallClimb as CanWallClimbComponent,
          jump: jump as CanJumpComponent,
          jumpAction: jumpAction as JumpActionStateComponent,
          climbDismount: climbDismount as ClimbDismountStateComponent,
        };
      });
  }

  function getClimbAttachmentEntities(componentStore: ComponentStore) {
    return componentStore
      .query("ClimbingState", "ContactState", "Transform")
      .map((entity) => {
        const [climbing, contact, transform] = entity.components;
        return {
          id: entity.id,
          climbing,
          contact: contact as ContactStateComponent,
          transform: transform as TransformComponent,
        };
      });
  }

  function getLocomotionActiveStateEntities(componentStore: ComponentStore) {
    return componentStore
      .query("LocomotionState", "ContactState")
      .map((entity) => {
        const [locomotion, contact] = entity.components;
        return {
          id: entity.id,
          locomotion: locomotion as LocomotionStateComponent,
          contact: contact as ContactStateComponent,
        };
      });
  }

  function getSteeringPets(componentStore: ComponentStore) {
    return componentStore
      .query(
        "Transform",
        "FlyingState",
        "MovementProfile",
        "IntentState",
        "MotionTarget",
        "NavigationState",
      )
      .map((entity) => {
        const [transform, , movement, intent, motion, navigation] =
          entity.components;

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

  function getFlightEntities(componentStore: ComponentStore) {
    return componentStore
      .query("PhysicsBody", "FlyingState", "CanFly")
      .map((entity) => {
        const [, flying, canFly] = entity.components;
        return {
          id: entity.id,
          flying,
          canFly: canFly as CanFlyComponent,
        };
      });
  }

  function getWalkingEntities(componentStore: ComponentStore) {
    return componentStore
      .query(
        "Transform",
        "WalkingState",
        "ContactState",
        "CanWalk",
        "MotionTarget",
        "NavigationState",
      )
      .map((entity) => {
        const [transform, walking, contact, canWalk, motion, navigation] =
          entity.components;
        return {
          id: entity.id,
          position: (transform as TransformComponent).position,
          walking,
          contact: contact as ContactStateComponent,
          canWalk: canWalk as CanWalkComponent,
          motion: motion as MotionTargetComponent,
          navigation: navigation as NavigationStateComponent,
        };
      });
  }

  function getJumpingEntities(componentStore: ComponentStore) {
    return componentStore
      .query("LocomotionState", "ContactState", "CanJump", "JumpActionState")
      .map((entity) => {
        const [locomotion, contact, jump, jumpAction] = entity.components;
        return {
          id: entity.id,
          locomotion: locomotion as LocomotionStateComponent,
          contact: contact as ContactStateComponent,
          jump: jump as CanJumpComponent,
          jumpAction: jumpAction as JumpActionStateComponent,
        };
      });
  }

  function getWallClimbingEntities(componentStore: ComponentStore) {
    return componentStore
      .query(
        "Transform",
        "ClimbingState",
        "CanWallClimb",
        "MotionTarget",
        "ContactState",
      )
      .map((entity) => {
        const [transform, climbing, canWallClimb, motion, contact] =
          entity.components;
        return {
          id: entity.id,
          position: (transform as TransformComponent).position,
          climbing,
          canWallClimb: canWallClimb as CanWallClimbComponent,
          motion: motion as MotionTargetComponent,
          contact: contact as ContactStateComponent,
        };
      });
  }

  function getCollisionReactionEntities(componentStore: ComponentStore) {
    return componentStore
      .query("Transform", "PhysicsBody", "IntentState", "MotionTarget")
      .map((entity) => {
        const [transform, body, intent, motion] = entity.components;
        return {
          id: entity.id,
          transform: transform as TransformComponent,
          body: body,
          intent: intent as IntentStateComponent,
          motion: motion as MotionTargetComponent,
        };
      });
  }

  function getPetSnapshots(componentStore: ComponentStore) {
    return componentStore
      .query(
        "PetIdentity",
        "AgentBinding",
        "IntentState",
        "LocomotionState",
        "SpeechState",
        "Transform",
      )
      .map((entity) => {
        const [identity, agent, intent, locomotion, speech, transform] =
          entity.components;

        return {
          id: entity.id,
          sourceId: (agent as AgentBindingComponent).sourceId,
          name: (identity as PetIdentityComponent).name,
          intent: (intent as IntentStateComponent).intent,
          locomotion: (locomotion as LocomotionStateComponent).baseMode,
          speech: (speech as SpeechStateComponent).speech,
          position: (transform as TransformComponent).position,
        };
      });
  }

  const stepSystems: Array<SimulationSystem<WorldStepContext>> = [
    {
      name: "StimulusReactionSystem",
      reads: [
        "AgentBinding",
        "IntentState",
        "SpeechProfile",
        "SpeechState",
        "ActivityState",
        "CompletionBehavior",
      ],
      writes: ["IntentState", "SpeechState", "ActivityState"],
      update(context) {
        runStimulusReactionSystem(
          getReactivePets(context.components),
          context.stimuli.drain(),
        );
      },
    },
    {
      name: "IdleConversationSystem",
      reads: [
        "IdleConversation",
        "SpeechProfile",
        "SpeechState",
        "ActivityState",
      ],
      writes: ["SpeechState"],
      update(context) {
        runIdleConversationSystem(
          getIdleConversationPets(context.components),
          context.clock,
        );
      },
    },
    {
      name: "PhysicsTransformSyncSystem",
      reads: ["PhysicsBody"],
      writes: ["Transform"],
      update(context) {
        runPhysicsTransformSyncSystem(
          getTransformEntities(context.components),
          context.physics,
        );
      },
    },
    {
      name: "ContactSystem",
      dependsOn: ["PhysicsTransformSyncSystem"],
      reads: [
        "Transform",
        "PhysicsBody",
        "ContactState",
        "ClimbableSurface",
        "Ground",
      ],
      writes: ["ContactState"],
      update(context) {
        runContactSystem(
          getContactEntities(context.components),
          getClimbableSurfaces(context.components),
          getGroundSurfaces(context.components),
        );
      },
    },
    {
      name: "LocomotionModeSystem",
      dependsOn: ["ContactSystem"],
      reads: [
        "LocomotionState",
        "ContactState",
        "MotionTarget",
        "CanWallClimb",
        "ClimbDismountState",
      ],
      writes: ["LocomotionState"],
      update(context) {
        runLocomotionModeSystem(getLocomotionModeEntities(context.components));
      },
    },
    {
      name: "ArrivalBehaviorSystem",
      dependsOn: ["LocomotionModeSystem"],
      reads: [
        "Transform",
        "MotionTarget",
        "WandersOnArrival",
        "IntentState",
        "LocomotionState",
        "UserAnchor",
      ],
      writes: ["MotionTarget", "IntentState"],
      update(context) {
        runArrivalBehaviorSystem(
          getArrivalBehaviorEntities(context.components),
          getAnchorPositions(context.components),
        );
      },
    },
    {
      name: "ClimbDismountSystem",
      dependsOn: ["ArrivalBehaviorSystem"],
      reads: [
        "LocomotionState",
        "MotionTarget",
        "ContactState",
        "CanWalk",
        "CanWallClimb",
        "CanJump",
        "JumpActionState",
        "ClimbDismountState",
      ],
      writes: ["LocomotionState", "JumpActionState", "ClimbDismountState"],
      update(context) {
        runClimbDismountSystem(
          getClimbDismountEntities(context.components),
          context.deltaMs,
        );
      },
    },
    {
      name: "LocomotionActiveStateSystem",
      dependsOn: ["ClimbDismountSystem"],
      reads: ["LocomotionState", "ContactState"],
      writes: [
        "WalkingState",
        "ClimbingState",
        "FlyingState",
        "AirborneState",
      ],
      update(context) {
        runLocomotionActiveStateSystem(
          getLocomotionActiveStateEntities(context.components),
          context.components,
        );
      },
    },
    {
      name: "ClimbAttachmentSystem",
      dependsOn: ["LocomotionActiveStateSystem"],
      reads: ["ClimbingState", "ContactState", "Transform"],
      writes: ["Transform", "PhysicsPosition", "PhysicsVelocity"],
      update(context) {
        runClimbAttachmentSystem(
          getClimbAttachmentEntities(context.components),
          context.physics,
        );
      },
    },
    {
      name: "MotionTargetSystem",
      dependsOn: ["ClimbAttachmentSystem"],
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
      name: "CollisionReactionSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: [
        "Transform",
        "PhysicsBody",
        "IntentState",
        "MotionTarget",
      ],
      writes: ["MotionTarget"],
      update(context) {
        runCollisionReactionSystem(
          getCollisionReactionEntities(context.components),
          context.bounds,
        );
      },
    },
    {
      name: "WalkSystem",
      dependsOn: ["CollisionReactionSystem"],
      reads: [
        "Transform",
        "WalkingState",
        "ContactState",
        "CanWalk",
        "MotionTarget",
        "NavigationState",
      ],
      writes: ["PhysicsForce"],
      update(context) {
        context.forceGroups.push(
          runWalkSystem(getWalkingEntities(context.components)),
        );
      },
    },
    {
      name: "JumpSystem",
      dependsOn: ["CollisionReactionSystem"],
      reads: ["LocomotionState", "ContactState", "CanJump", "JumpActionState"],
      writes: ["PhysicsForce", "JumpActionState"],
      update(context) {
        context.forceGroups.push(
          runJumpSystem(getJumpingEntities(context.components), context.deltaMs),
        );
      },
    },
    {
      name: "WallClimbSystem",
      dependsOn: ["CollisionReactionSystem"],
      reads: [
        "Transform",
        "ClimbingState",
        "CanWallClimb",
        "MotionTarget",
        "ContactState",
      ],
      writes: ["PhysicsForce"],
      update(context) {
        context.forceGroups.push(
          runWallClimbSystem(getWallClimbingEntities(context.components)),
        );
      },
    },
    {
      name: "IntentSteeringSystem",
      dependsOn: ["CollisionReactionSystem"],
      reads: [
        "Transform",
        "FlyingState",
        "MovementProfile",
        "IntentState",
        "MotionTarget",
        "NavigationState",
      ],
      writes: ["PhysicsForce"],
      update(context) {
        context.forceGroups.push(
          runIntentSteeringSystem(getSteeringPets(context.components)),
        );
      },
    },
    {
      name: "FlightSystem",
      dependsOn: ["IntentSteeringSystem"],
      reads: ["PhysicsBody", "FlyingState", "CanFly"],
      writes: ["PhysicsGravityScale"],
      update(context) {
        runFlightSystem(getFlightEntities(context.components), context.physics);
      },
    },
    {
      name: "PhysicsIntegrationSystem",
      dependsOn: [
        "WalkSystem",
        "JumpSystem",
        "WallClimbSystem",
        "IntentSteeringSystem",
        "FlightSystem",
      ],
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
        runPhysicsTransformSyncSystem(
          getTransformEntities(context.components),
          context.physics,
        );
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
    getComponent<TType extends SimulationComponentType>(
      id: string,
      type: TType,
    ) {
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
      const physicsSnapshot = runPhysicsTransformSyncSystem(
        getTransformEntities(components),
        physics,
      );

      return {
        ...physicsSnapshot,
        pets: getPetSnapshots(components),
        climbableSurfaces: getClimbableSurfaceSnapshots(components),
      };
    },
  };
}
