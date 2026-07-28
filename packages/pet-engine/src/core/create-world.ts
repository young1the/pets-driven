import {
  type ComponentStore,
  createComponentStore,
  type EntityDeclaration,
} from "@pets-driven/pet-engine/core/component-store";
import type { Component, ComponentType } from "@pets-driven/pet-engine/core/components";
import type { MonitorWorkArea, WorldViewport } from "@pets-driven/pet-engine/core/monitor-geometry";
import { derivePetActivity } from "@pets-driven/pet-engine/core/pet-activity";
import { STEP_SYSTEMS } from "@pets-driven/pet-engine/core/phases";
import {
  describeSimulationSystems,
  runSimulationSystems,
} from "@pets-driven/pet-engine/core/simulation-system";
import type { PetVisualCue } from "@pets-driven/pet-engine/core/world-snapshot";
import { agentTaskBadgeLabel } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import { getPetAnimationState } from "@pets-driven/pet-engine/features/behavior/pet-animation-state";
import type { WorldEvent } from "@pets-driven/pet-engine/features/events/world-event";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import {
  DEFAULT_ITEM_PICKUP_RADIUS,
  DEFAULT_ITEM_SPAWNER,
} from "@pets-driven/pet-engine/features/items/components";
import { dropRandomWorldItem } from "@pets-driven/pet-engine/features/items/systems";
import { createMatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import { runPhysicsTransformSyncSystem } from "@pets-driven/pet-engine/features/physics/systems";
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
  // Ids for host-driven manual drops in a world that runs no ItemSpawner. When
  // a spawner is present, drops share its `dropped` counter instead so the two
  // sources never mint the same entity id.
  let manualDropSequence = 0;

  registerPhysicsBodies();

  function registerPhysicsBodies() {
    for (const entity of components.query("Transform", "PhysicsBody")) {
      registerPhysicsBody(entity.id);
    }
  }

  // Register the Matter body for a single entity from its current Transform +
  // PhysicsBody components. Shared by the initial bulk pass and by addEntity so
  // pets spawned mid-simulation get a body the same way the fixture ones do.
  function registerPhysicsBody(id: string) {
    const transform = components.getComponent(id, "Transform");
    const body = components.getComponent(id, "PhysicsBody");
    if (!transform || !body || body.shape !== "rectangle") {
      return;
    }
    const material = components.getComponent(id, "PhysicsMaterial");
    const size = { width: body.width, height: body.height };
    const materialOptions = material
      ? { friction: material.friction, restitution: material.restitution }
      : undefined;

    if (components.getComponent(id, "Ground")) {
      physics.addStaticRectangle(id, transform.position, size, materialOptions);
      return;
    }
    physics.addRectangle(id, transform.position, size, materialOptions);
  }

  function getPetSnapshots(componentStore: ComponentStore) {
    return componentStore
      .query("PetIdentity", "AgentBinding", "Steering", "Transform")
      .map((entity) => {
        const [identity, agent, steering, transform] = entity.components;
        const contactState = componentStore.getComponent(entity.id, "ContactState");
        const decisionState = componentStore.getComponent(entity.id, "BehaviorDecisionState");
        const agentTask = componentStore.getComponent(entity.id, "AgentTaskState");
        const agentChannel = componentStore.getComponent(entity.id, "AgentChannelState");
        const expression = componentStore.getComponent(entity.id, "PetExpressionState");
        return {
          id: entity.id,
          sourceId: agent.sourceId,
          name: identity.name,
          steering: steering.mode,
          locomotion: getLocomotionLabel(componentStore, entity.id),
          action: getActionLabel(componentStore, entity.id),
          speech: agentChannel?.message ?? null,
          position: transform.position,
          contact: {
            grounded: contactState?.grounded ?? false,
            climbableSurfaceId: contactState?.climbableSurfaceId ?? null,
          },
          motionTarget:
            componentStore.getComponent(entity.id, "MotionTarget")?.targetPosition ?? null,
          activity: derivePetActivity(componentStore, entity.id, input.clock.now()),
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
          mood: (() => {
            const mood = componentStore.getComponent(entity.id, "MoodState");
            if (!mood) return null;
            const memory = componentStore.getComponent(entity.id, "RecentExperienceMemory");
            return {
              valence: mood.valence,
              arousal: mood.arousal,
              confidence: mood.confidence,
              recentExperienceCount: memory?.entries.length ?? 0,
            };
          })(),
          decision: decisionState
            ? {
                source: decisionState.source,
                reason: decisionState.reason,
                decidedAt: decisionState.decidedAt,
              }
            : null,
          pendingReaction: (() => {
            const pr = componentStore.getComponent(entity.id, "PendingReaction");
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
          carrying: (() => {
            const carried = componentStore.getComponent(entity.id, "CarriedItem");
            return carried
              ? {
                  kind: carried.kind,
                  pickedUpAt: carried.pickedUpAt,
                  expiresAt: carried.expiresAt,
                }
              : null;
          })(),
        };
      });
  }

  function getSocialSnapshot(componentStore: ComponentStore, id: string) {
    const member = componentStore.getComponent(id, "SocialSessionMember");
    if (!member) return null;
    const session = componentStore.getComponent(member.sessionId, "SocialSession");
    if (!session) return null;
    return {
      kind: session.kind,
      phase: session.phase,
      role: member.role,
      partnerId: member.partnerId,
      partnerName: componentStore.getComponent(member.partnerId, "PetIdentity")?.name ?? null,
    };
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

  function getPetVisualCue(componentStore: ComponentStore, id: string): PetVisualCue | null {
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
      case "play-romp":
        return {
          kind: "playful",
          icon: "✦",
          label: "romping around",
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
      case "session-dance":
        return {
          kind: "playful",
          icon: "🎵",
          label: "dancing with a friend",
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
    if (climbIntent?.phase === "attached" || componentStore.getComponent(id, "ClimbingTag")) {
      return "climb-attached";
    }

    const jumpAction = componentStore.getComponent(id, "JumpActionState");
    if (jumpAction) return `jump-${jumpAction.phase}`;

    if (componentStore.getComponent(id, "AirborneTag")) return "airborne";

    return "none";
  }

  function getWorldItemSnapshots(componentStore: ComponentStore) {
    return componentStore.query("WorldItem", "Transform").map((entity) => {
      const [item, transform] = entity.components;
      return {
        id: entity.id,
        kind: item.kind,
        position: { ...transform.position },
        expiresAt: item.expiresAt,
      };
    });
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
    // Spawn a new entity into the live world and register its physics body,
    // matching how the initial fixture entities are hydrated. Lets the desktop
    // host add a newly deployed pet without rebuilding the whole world (which
    // would reset every other pet's position and animation).
    addEntity(declaration: EntityDeclaration) {
      components.spawn(declaration.id, declaration.components);
      registerPhysicsBody(declaration.id);
    },
    // Tear a single entity out of the live world: drop its physics body first,
    // then every component it owns. Idempotent — unknown ids no-op. Systems that
    // still hold a reference (e.g. a social session partner) prune it on their
    // next pass, since their lookups now miss.
    removeEntity(id: string) {
      physics.removeBody(id);
      components.destroy(id);
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
    // Resize a live rectangle body (and its PhysicsBody component) in place,
    // keeping its bottom edge on the floor. Lets the desktop host track a pet's
    // scale changes without rebuilding the whole world. Transform re-syncs from
    // the physics body on the next snapshot.
    setBodySize(id: string, size: { width: number; height: number }) {
      physics.resizeRectangle(id, size);
      const body = components.getComponent(id, "PhysicsBody");
      if (body && body.shape === "rectangle") {
        components.setComponent(id, {
          ...body,
          width: size.width,
          height: size.height,
        });
      }
    },
    removeComponent(id: string, type: ComponentType) {
      components.removeComponent(id, type);
    },
    pushEvent(event: WorldEvent) {
      events.push(event);
    },
    /**
     * Host-facing entry point for a manual trinket drop — the main window's
     * treat button, in place of the automatic ItemSpawner cadence. Drops
     * one random trinket onto a desktop floor now, ignoring maxOnScreen (a
     * button press should always land something). Uses the ItemSpawner's pool
     * and lifetime when the scenario has one, the tuned defaults otherwise.
     * Returns the new entity id, or null when there was nowhere to place one
     * (no floor in view, or an empty kind pool).
     */
    dropRandomItem(): string | null {
      const bounds = {
        x: input.viewport?.x ?? 0,
        y: input.viewport?.y ?? 0,
        width: input.width,
        height: input.height,
      };
      const spawner = components.components("ItemSpawner").values().next().value;
      const params = {
        kinds: spawner ? spawner.kinds : [...DEFAULT_ITEM_SPAWNER.kinds],
        itemLifetimeMs: spawner ? spawner.itemLifetimeMs : DEFAULT_ITEM_SPAWNER.itemLifetimeMs,
        pickupRadius: DEFAULT_ITEM_PICKUP_RADIUS,
      };
      const sequence = spawner ? spawner.dropped : manualDropSequence;
      const id = dropRandomWorldItem(
        components,
        random,
        bounds,
        input.clock.now(),
        params,
        sequence,
      );
      if (id) {
        if (spawner) {
          spawner.dropped += 1;
        } else {
          manualDropSequence += 1;
        }
      }
      return id;
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
      const physicsSnapshot = runPhysicsTransformSyncSystem(components, physics);
      const bodies = physicsSnapshot.bodies.map((body) => ({
        ...body,
        animationState: getPetAnimationState(components, body.id, input.clock.now()),
        interaction: getInteractionSnapshot(components, body.id),
      }));

      return {
        ...physicsSnapshot,
        now: input.clock.now(),
        viewport: input.viewport,
        monitors: input.monitors,
        bodies,
        pets: getPetSnapshots(components),
        climbableSurfaces: getClimbableSurfaceSnapshots(components),
        items: getWorldItemSnapshots(components),
      };
    },
  };
}
