import type {
  Component,
  ComponentType,
} from "@/core/components";
import {
  createComponentStore,
  type ComponentStore,
  type EntityDeclaration,
} from "@/core/component-store";
import {
  createMatterPhysicsWorld,
} from "@/features/physics/matter-physics-world";
import type {
  PetAnimationState,
  PetSpriteFacing,
} from "@/pets/assets/pet-atlas";
import type {
  MonitorWorkArea,
  WorldViewport,
} from "@/core/monitor-geometry";
import type { WorldEvent } from "@/features/events/world-event";
import { createWorldEventQueue } from "@/features/events/world-event-queue";
import { runPhysicsTransformSyncSystem } from "@/features/physics/systems";
import type { PetVisualCue } from "@/core/world-snapshot";
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
  viewport?: WorldViewport;
  monitors?: MonitorWorkArea[];
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
  const events = createWorldEventQueue();
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
        const heldAgentState = componentStore.getComponent(entity.id, "HeldAgentState");
        return {
          id: entity.id,
          sourceId: agent.sourceId,
          name: identity.name,
          intent: intent.intent,
          locomotion: getLocomotionLabel(componentStore, entity.id),
          action: getActionLabel(componentStore, entity.id),
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
          heldAgentState: heldAgentState
            ? {
                kind: heldAgentState.kind,
                label: heldAgentState.kind === "waiting"
                  ? "WAIT" as const
                  : heldAgentState.kind === "failed"
                    ? "FAIL" as const
                    : "DONE" as const,
                summary: heldAgentState.summary,
              }
            : null,
          visualCue: getPetVisualCue(componentStore, entity.id),
          interaction: getInteractionSnapshot(componentStore, entity.id),
        };
      });
  }

  function getInteractionSnapshot(componentStore: ComponentStore, id: string) {
    const drag = componentStore.getComponent("user-interaction", "DragInteraction");
    const target = componentStore.getComponent("user-interaction", "KeyboardControlTarget");
    const controllable = !!componentStore.getComponent(id, "CanControl");
    const dragged = drag?.entityId === id && drag.phase === "dragging";
    const controlled = target?.entityId === id;
    const selected = controlled;
    if (!controllable && !dragged && !controlled && !selected) return undefined;

    return {
      controllable,
      selected,
      dragged,
      controlled,
      scale: dragged ? 1.12 : undefined,
    };
  }

  function getPetVisualCue(
    componentStore: ComponentStore,
    id: string,
  ): PetVisualCue | null {
    const pendingReaction = componentStore.getComponent(id, "PendingReaction");
    if (pendingReaction?.source === "collision") {
      return {
        kind: "surprised",
        icon: "!",
        label: "surprised by collision",
      };
    }

    const decisionState = componentStore.getComponent(id, "BehaviorDecisionState");
    switch (decisionState?.reason) {
      case "approach-pet-success":
        return {
          kind: "affection",
          icon: "♥♥",
          label: "caught another pet",
        };
      case "approach-pet":
      case "collision-engage":
      case "collision-stay":
        return {
          kind: "affection",
          icon: "♥",
          label: "approaching another pet",
        };
      case "flee-from-pet":
      case "collision-avoid":
      case "collision-flee":
        return {
          kind: "flee",
          icon: ">>",
          label: "fleeing",
        };
      case "wander-near":
      case "wander-far":
      case "collision-unfazed":
        return {
          kind: "wander",
          icon: "♪",
          label: "wandering",
        };
      default:
        return null;
    }
  }

  function getLocomotionLabel(componentStore: ComponentStore, id: string) {
    if (componentStore.getComponent(id, "FlyingTag")) return "fly";
    return "walk";
  }

  function getActionLabel(componentStore: ComponentStore, id: string) {
    const climbDismount = componentStore.getComponent(id, "ClimbDismountState");
    if (climbDismount) return "climb-dismounting";

    const climbIntent = componentStore.getComponent(id, "ClimbIntentState");
    if (climbIntent?.phase === "approaching") return "climb-approaching";
    if (climbIntent?.phase === "attached" || componentStore.getComponent(id, "ClimbingTag")) {
      return "climb-attached";
    }

    const jumpAction = componentStore.getComponent(id, "JumpActionState");
    if (jumpAction) return `jump-${jumpAction.phase}`;

    if (componentStore.getComponent(id, "AirborneTag")) return "airborne";

    return "none";
  }

  function getPetAnimationState(
    componentStore: ComponentStore,
    id: string,
    body: { vy: number },
  ): PetAnimationState | undefined {
    if (!componentStore.getComponent(id, "PetIdentity")) {
      return undefined;
    }

    const decision = componentStore.getComponent(id, "BehaviorDecisionState");
    const heldAgentState = componentStore.getComponent(id, "HeldAgentState");
    if (heldAgentState?.kind === "failed") {
      return "failed";
    }

    if (heldAgentState?.kind === "completed") {
      return "review";
    }

    if (heldAgentState?.kind === "waiting") {
      return "waiting";
    }

    if (decision?.reason === "task.failed") {
      return "failed";
    }

    if (decision?.reason === "task.completed") {
      return "review";
    }

    if (
      decision?.reason === "task.waiting" ||
      decision?.reason === "attention.requested"
    ) {
      return "waiting";
    }

    const jumpAction = componentStore.getComponent(id, "JumpActionState");
    if (
      jumpAction ||
      componentStore.getComponent(id, "AirborneTag") ||
      Math.abs(body.vy) > 0.5
    ) {
      return "jumping";
    }

    const motionTarget = componentStore.getComponent(id, "MotionTarget");
    const transform = componentStore.getComponent(id, "Transform");
    const targetX = motionTarget?.targetPosition?.x;
    if (transform && targetX !== undefined) {
      const deltaX = targetX - transform.position.x;
      if (Math.abs(deltaX) > 2) {
        return deltaX > 0 ? "running-right" : "running-left";
      }

      return "running";
    }

    const intent = componentStore.getComponent(id, "IntentState");
    if (intent?.intent === "active") {
      return "running";
    }

    return "idle";
  }

  function getPetSpriteFacing(
    componentStore: ComponentStore,
    id: string,
  ): PetSpriteFacing {
    const transform = componentStore.getComponent(id, "Transform");
    const motionTarget = componentStore.getComponent(id, "MotionTarget");
    const targetX = motionTarget?.targetPosition?.x;
    if (transform && targetX !== undefined) {
      const deltaX = targetX - transform.position.x;
      if (Math.abs(deltaX) > 2) {
        return deltaX > 0 ? "right" : "left";
      }
    }

    return "right";
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
    getComponent<TType extends ComponentType>(id: string, type: TType) {
      return components.getComponent(id, type);
    },
    setComponent(id: string, component: Component) {
      components.setComponent(id, component);
    },
    setPhysicsPosition(id: string, position: Partial<{ x: number; y: number }>) {
      physics.setPosition(id, position);
      const transform = components.getComponent(id, "Transform");
      if (transform) {
        transform.position = {
          x: position.x ?? transform.position.x,
          y: position.y ?? transform.position.y,
        };
      }
    },
    setPhysicsVelocity(id: string, velocity: Partial<{ x: number; y: number }>) {
      physics.setVelocity(id, velocity);
    },
    removeComponent(id: string, type: ComponentType) {
      components.removeComponent(id, type);
    },
    pushEvent(event: WorldEvent) {
      events.push(event);
    },
    step(deltaMs: number) {
      runSimulationSystems(STEP_SYSTEMS, {
        deltaMs,
        components,
        physics,
        events,
        clock: input.clock,
        random,
        bounds: {
          x: input.viewport?.x ?? 0,
          y: input.viewport?.y ?? 0,
          width: input.width,
          height: input.height,
        },
        forceGroups: [],
      });
    },
    snapshot() {
      const physicsSnapshot = runPhysicsTransformSyncSystem(components, physics);
      const bodies = physicsSnapshot.bodies.map((body) => ({
        ...body,
        animationState: getPetAnimationState(components, body.id, body),
        spriteFacing: getPetSpriteFacing(components, body.id),
        interaction: getInteractionSnapshot(components, body.id),
      }));

      return {
        ...physicsSnapshot,
        viewport: input.viewport,
        monitors: input.monitors,
        bodies,
        pets: getPetSnapshots(components),
        climbableSurfaces: getClimbableSurfaceSnapshots(components),
      };
    },
  };
}
