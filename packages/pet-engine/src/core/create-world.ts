import type {
  Component,
  ComponentType,
} from "@pets-driven/pet-engine/core/components";
import {
  createComponentStore,
  type ComponentStore,
  type EntityDeclaration,
} from "@pets-driven/pet-engine/core/component-store";
import { createMatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import type {
  PetAnimationState,
  PetSpriteFacing,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type {
  MonitorWorkArea,
  WorldViewport,
} from "@pets-driven/pet-engine/core/monitor-geometry";
import type { WorldEvent } from "@pets-driven/pet-engine/features/events/world-event";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import { runPhysicsTransformSyncSystem } from "@pets-driven/pet-engine/features/physics/systems";
import type { PetVisualCue } from "@pets-driven/pet-engine/core/world-snapshot";
import { agentTaskBadgeLabel } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import { derivePetActivity } from "@pets-driven/pet-engine/core/pet-activity";
import {
  describeSimulationSystems,
  runSimulationSystems,
} from "@pets-driven/pet-engine/core/simulation-system";
import { STEP_SYSTEMS } from "@pets-driven/pet-engine/core/phases";
import {
  createSeededRandom,
  type RandomSource,
} from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { ManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

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

  function getPetSnapshots(componentStore: ComponentStore) {
    return componentStore
      .query(
        "PetIdentity",
        "AgentBinding",
        "IntentState",
        "SpeechState",
        "Transform",
      )
      .map((entity) => {
        const [identity, agent, intent, speech, transform] = entity.components;
        const contactState = componentStore.getComponent(
          entity.id,
          "ContactState",
        );
        const decisionState = componentStore.getComponent(
          entity.id,
          "BehaviorDecisionState",
        );
        const agentTask = componentStore.getComponent(
          entity.id,
          "AgentTaskState",
        );
        const agentChannel = componentStore.getComponent(
          entity.id,
          "AgentChannelState",
        );
        const expression = componentStore.getComponent(
          entity.id,
          "PetExpressionState",
        );
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
            componentStore.getComponent(entity.id, "MotionTarget")
              ?.targetPosition ?? null,
          activity: derivePetActivity(
            componentStore,
            entity.id,
            input.clock.now(),
          ),
          drives: (() => {
            const drives = componentStore.getComponent(entity.id, "Drives");
            return drives
              ? {
                  social: drives.social,
                  energy: drives.energy,
                  curiosity: drives.curiosity,
                }
              : null;
          })(),
          decision: decisionState
            ? {
                source: decisionState.source,
                reason: decisionState.reason,
                decidedAt: decisionState.decidedAt,
              }
            : null,
          pendingReaction: (() => {
            const pr = componentStore.getComponent(
              entity.id,
              "PendingReaction",
            );
            return pr ? { source: pr.source, reactsAt: pr.reactsAt } : null;
          })(),
          agentTask: agentTask
            ? {
                status: agentTask.status,
                label: agentTaskBadgeLabel(agentTask.status),
                summary: agentTask.summary,
              }
            : null,
          agentChannel: agentChannel
            ? {
                source: agentChannel.source,
                status: agentChannel.status,
                label: agentChannel.label,
                message: agentChannel.message,
                updatedAt: agentChannel.updatedAt,
                expiresAt: agentChannel.expiresAt,
              }
            : null,
          visualCue: getPetVisualCue(componentStore, entity.id),
          expression: expression
            ? {
                source: expression.source,
                mood: expression.mood,
                emote: expression.emote,
                label: expression.label,
                startedAt: expression.startedAt,
                expiresAt: expression.expiresAt,
              }
            : null,
          interaction: getInteractionSnapshot(componentStore, entity.id),
          social: getSocialSnapshot(componentStore, entity.id),
        };
      });
  }

  function getSocialSnapshot(componentStore: ComponentStore, id: string) {
    const member = componentStore.getComponent(id, "SocialSessionMember");
    if (!member) return null;
    const session = componentStore.getComponent(
      member.sessionId,
      "SocialSession",
    );
    if (!session) return null;
    return {
      kind: session.kind,
      phase: session.phase,
      role: member.role,
      partnerId: member.partnerId,
    };
  }

  function getInteractionSnapshot(componentStore: ComponentStore, id: string) {
    const drag = componentStore.getComponent(
      "user-interaction",
      "DragInteraction",
    );
    const target = componentStore.getComponent(
      "user-interaction",
      "KeyboardControlTarget",
    );
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

    const decisionState = componentStore.getComponent(
      id,
      "BehaviorDecisionState",
    );
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
      case "chase-cursor-success":
        return {
          kind: "playful",
          icon: "★",
          label: "caught the cursor",
        };
      case "chase-cursor":
        return {
          kind: "playful",
          icon: "✦",
          label: "chasing the cursor",
        };
      case "petting":
        return {
          kind: "affection",
          icon: "♥",
          label: "enjoying the pets",
        };
      case "session-greet":
      case "session-chat":
        return {
          kind: "affection",
          icon: "♥",
          label: "playing with a friend",
        };
      case "session-chase":
        return {
          kind: "playful",
          icon: "✦",
          label: "chasing a friend",
        };
      case "social-invite":
        return {
          kind: "affection",
          icon: "♥",
          label: "saying hello",
        };
      case "socialized":
        return {
          kind: "affection",
          icon: "♥♥",
          label: "made a friend",
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
    if (
      climbIntent?.phase === "attached" ||
      componentStore.getComponent(id, "ClimbingTag")
    ) {
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
    body: { vx: number; vy: number },
  ): PetAnimationState | undefined {
    if (!componentStore.getComponent(id, "PetIdentity")) {
      return undefined;
    }

    const agentTask = componentStore.getComponent(id, "AgentTaskState");

    // Status poses (waiting / failed / review) only apply while the pet is
    // actually held. Once the user releases the hold, the reported status
    // stays on the pet but locomotion drives the sprite again.
    if (componentStore.getComponent(id, "TaskMovementHold")) {
      if (agentTask?.status === "failed") return "failed";
      if (agentTask?.status === "completed") return "review";
      if (agentTask?.status === "waiting") return "waiting";

      const decision = componentStore.getComponent(id, "BehaviorDecisionState");
      if (decision?.reason === "task.failed") return "failed";
      if (decision?.reason === "task.completed") return "review";
      if (
        decision?.reason === "task.waiting" ||
        decision?.reason === "attention.requested"
      ) {
        return "waiting";
      }
    }

    const jumpAction = componentStore.getComponent(id, "JumpActionState");
    if (
      jumpAction ||
      componentStore.getComponent(id, "AirborneTag") ||
      Math.abs(body.vy) > 0.5
    ) {
      return "jumping";
    }

    // System-driven horizontal movement plays the directional travel sprites.
    // Read the pet's actual horizontal velocity so every kind of system push —
    // walking toward a target, fleeing, collision recoil, coasting momentum —
    // reads as travel, rather than falling through to the stationary task-run
    // ("running") sprite that does not look like it is moving.
    const travelDirection = getTravelDirection(body);
    if (travelDirection) {
      return travelDirection === "right" ? "running-right" : "running-left";
    }

    const intent = componentStore.getComponent(id, "IntentState");
    if (intent?.intent === "active") {
      return "running";
    }

    return agentTask?.status === "working" ? "running" : "idle";
  }

  function getPetSpriteFacing(body: { vx: number }): PetSpriteFacing {
    return getTravelDirection(body) ?? "right";
  }

  // Horizontal speed above this (matter.js units, matching the vertical jump
  // threshold) counts as the pet visibly travelling, so it plays a directional
  // running sprite instead of the stationary task-run animation.
  const TRAVEL_SPEED_THRESHOLD = 0.5;

  function getTravelDirection(body: { vx: number }): PetSpriteFacing | null {
    if (Math.abs(body.vx) <= TRAVEL_SPEED_THRESHOLD) {
      return null;
    }
    return body.vx > 0 ? "right" : "left";
  }

  function getClimbableSurfaceSnapshots(componentStore: ComponentStore) {
    return componentStore
      .query("Transform", "ClimbableSurface")
      .map((entity) => {
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
    setPhysicsPosition(
      id: string,
      position: Partial<{ x: number; y: number }>,
    ) {
      physics.setPosition(id, position);
      const transform = components.getComponent(id, "Transform");
      if (transform) {
        transform.position = {
          x: position.x ?? transform.position.x,
          y: position.y ?? transform.position.y,
        };
      }
    },
    setPhysicsVelocity(
      id: string,
      velocity: Partial<{ x: number; y: number }>,
    ) {
      physics.setVelocity(id, velocity);
    },
    removeComponent(id: string, type: ComponentType) {
      components.removeComponent(id, type);
    },
    pushEvent(event: WorldEvent) {
      events.push(event);
    },
    /**
     * Host-facing entry point for live cursor tracking: writes a transient
     * CursorInput onto the "user-anchor" entity, which CursorInputSystem
     * consumes on the next PRE_UPDATE pass (sample append + Transform sync).
     * No-ops when the scenario has no UserAnchor entity (e.g. dual-monitor
     * demo layouts that opt out of a user anchor).
     */
    feedCursorPosition(position: { x: number; y: number }, at: number) {
      let anchorId: string | null = null;
      for (const entity of components.entities()) {
        if (components.getComponent(entity.id, "UserAnchor")) {
          anchorId = entity.id;
          break;
        }
      }
      if (!anchorId) return;
      components.setComponent(anchorId, {
        type: "CursorInput",
        position: { ...position },
        at,
      });
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
      const physicsSnapshot = runPhysicsTransformSyncSystem(
        components,
        physics,
      );
      const bodies = physicsSnapshot.bodies.map((body) => ({
        ...body,
        animationState: getPetAnimationState(components, body.id, body),
        spriteFacing: getPetSpriteFacing(body),
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
