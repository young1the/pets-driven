import {
  type ComponentStore,
  createComponentStore,
  type EntityDeclaration,
} from "@pets-driven/pet-engine/core/component-store";
import type { Component, ComponentType } from "@pets-driven/pet-engine/core/components";
import type { MonitorWorkArea, WorldViewport } from "@pets-driven/pet-engine/core/monitor-geometry";
import { derivePetActivity } from "@pets-driven/pet-engine/core/pet-activity";
import { STEP_SYSTEMS } from "@pets-driven/pet-engine/core/phases";
import { DEFAULT_QUIET_MODE, type QuietMode } from "@pets-driven/pet-engine/core/quiet-mode";
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
  COURSE_LANE_BACK,
  COURSE_LANE_FORWARD,
  GAME_COUNTDOWN_MS,
  GAME_SESSION_ENTITY_ID,
  type GameControlSource,
  type GamePhase,
  type GameSpawnSource,
  gameCountdownGlyph,
} from "@pets-driven/pet-engine/features/game/components";
import { sweepCourse } from "@pets-driven/pet-engine/features/game/systems";
import { INTERACTION_ENTITY_ID } from "@pets-driven/pet-engine/features/interaction/systems";
import {
  DEFAULT_ITEM_PICKUP_RADIUS,
  DEFAULT_ITEM_SPAWNER,
} from "@pets-driven/pet-engine/features/items/components";
import {
  desktopFloorSpans,
  dropRandomWorldItem,
} from "@pets-driven/pet-engine/features/items/systems";
import { createMatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import { runPhysicsTransformSyncSystem } from "@pets-driven/pet-engine/features/physics/systems";
import { BALL_RADIUS, type WorldPropKind } from "@pets-driven/pet-engine/features/props/components";
import { createProp } from "@pets-driven/pet-engine/features/props/entities";
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
  /** Starting Quiet Mode level; the host may change it on the live world. */
  quietMode?: QuietMode;
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
  // Behind each hand-placed prop's entity id. Props have no spawner to carry a
  // counter, and never reuse an id even after one is cleared — a recycled id
  // would land on an overlay window the shell has not finished tearing down.
  let propSequence = 0;
  let quietMode: QuietMode = input.quietMode ?? DEFAULT_QUIET_MODE;

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
    if (!transform || !body) {
      return;
    }
    const material = components.getComponent(id, "PhysicsMaterial");
    const size = { width: body.width, height: body.height };
    // Deliberately not `frictionAir`: the rectangle path has never forwarded it
    // (two playground fixtures set it and have always run without it), and
    // starting now would quietly retune every jump arc in this world. A circle
    // is new, so it gets the whole material.
    const materialOptions = material
      ? { friction: material.friction, restitution: material.restitution }
      : undefined;

    if (body.shape === "circle") {
      // A circle is never ground — the static surfaces of this world are all
      // slabs — so it always joins as a dynamic body. Air drag matters to a
      // rolling ball in a way it does not to a walker, so this path passes the
      // material through whole.
      physics.addCircle(id, transform.position, body.width / 2, material ?? undefined);
      return;
    }

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
          game: getPetGameSnapshot(componentStore, entity.id),
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

  /**
   * The game a pet is in, or nothing. Read per pet rather than handed to the
   * host as one world-level object because that is how the window that draws
   * this pet asks the question — it has an id and wants to know what to put
   * over that head.
   */
  function getPetGameSnapshot(componentStore: ComponentStore, id: string) {
    const session = componentStore.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
    if (!session?.petId || session.petId !== id) return undefined;

    return {
      phase: session.phase,
      control: session.control,
      spawn: session.spawn,
      countdown: gameCountdownGlyph(session.countdownMs),
      score: Math.floor(session.score),
      cleared: session.cleared,
      lane: getGameLaneSnapshot(componentStore, session.petId, session.anchorX),
    };
  }

  /**
   * Where the pet is standing inside its lane, and how much lane there is.
   *
   * Resolved here rather than left to each host to work out from the anchor and
   * two constants, because the lane is invisible: the pet simply stops, and the
   * only way to know why — or that there was ever anywhere else to go — is for
   * something to draw it. A host cannot draw what it has to reconstruct.
   */
  function getGameLaneSnapshot(
    componentStore: ComponentStore,
    petId: string,
    anchorX: number,
  ): { offset: number; forward: number; back: number } | null {
    const position = componentStore.getComponent(petId, "Transform")?.position;
    if (!position) return null;

    return {
      offset: position.x - anchorX,
      forward: COURSE_LANE_FORWARD,
      back: COURSE_LANE_BACK,
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

  // Position comes from Transform (kept in step with the body by the pre/post
  // sync systems) but the angle can only come from the physics snapshot — the
  // engine has no rotation component, and nothing in the simulation reasons
  // about a body's spin. It is presentation, so it is read here and nowhere
  // else.
  function getWorldPropSnapshots(componentStore: ComponentStore, bodyAngles: Map<string, number>) {
    return componentStore.query("WorldProp", "Transform", "PhysicsBody").map((entity) => {
      const [prop, transform, body] = entity.components;
      return {
        id: entity.id,
        kind: prop.kind,
        position: { ...transform.position },
        radius: body.width / 2,
        angle: bodyAngles.get(entity.id) ?? 0,
        grabbable: !!componentStore.getComponent(entity.id, "CanDrag"),
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
     * Host-facing entry point for placing a prop — the main window's place
     * dialog. Puts one on a desktop floor now and registers its physics body,
     * so it drops into a live world the same way a pet deployed mid-session
     * does. Returns the new entity id, or null when there was no floor in view.
     *
     * Unlike a trinket a prop has no lifetime and no spawner: nothing sweeps it
     * away, which is what makes it furniture. `removeEntity` is how it leaves.
     */
    spawnProp(kind: WorldPropKind): string | null {
      const bounds = {
        x: input.viewport?.x ?? 0,
        y: input.viewport?.y ?? 0,
        width: input.width,
        height: input.height,
      };
      const spans = desktopFloorSpans(components, bounds);
      if (spans.length === 0) return null;

      const span = spans[Math.min(spans.length - 1, Math.floor(random.next() * spans.length))];
      const id = `prop-${kind}-${propSequence}`;
      propSequence += 1;
      components.spawn(
        id,
        createProp(
          kind,
          {
            x: span.minX + random.next() * (span.maxX - span.minX),
            y: span.topY - BALL_RADIUS,
          },
          input.clock.now(),
          id,
        ).components,
      );
      registerPhysicsBody(id);
      return id;
    },
    /** Every prop currently in the world, so a host can offer to clear them. */
    propIds(): string[] {
      return components.query("WorldProp").map((entity) => entity.id);
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
    /**
     * Host-facing entry point for game mode: put one pet on a course.
     *
     * Replaces whatever session was running rather than refusing — starting a
     * game on a second pet plainly means "that one instead", and the singleton
     * is what makes that the only thing it can mean.
     */
    startGame(
      petId: string,
      options?: { control?: GameControlSource; spawn?: GameSpawnSource },
    ): boolean {
      const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
      if (!session) return false;
      if (!components.getComponent(petId, "PetIdentity")) return false;

      // Whatever the last round left standing goes first. Its obstacles would
      // otherwise slide on into this one as scenery nobody laid, and a pet it
      // knocked down is held there until a sweep — which, without this, would
      // be a sweep that never came.
      sweepCourse(components, physics);

      session.petId = petId;
      // `control` is derived from the keyboard every tick (GameSessionSystem),
      // so asking for a user-driven round means handing the keyboard this pet
      // — the same state a press on it would have produced.
      session.control = options?.control ?? "pet";
      if (options?.control === "user") {
        const steering = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
        if (steering) steering.entityId = petId;
      }
      session.spawn = options?.spawn ?? "tool-use";
      session.phase = "countdown";
      session.countdownMs = GAME_COUNTDOWN_MS;
      session.score = 0;
      session.cleared = 0;
      session.startedAt = input.clock.now();
      // The middle of the pet's lane for this round. Taken once, here, so the
      // boundary stays put instead of drifting along with the pet.
      session.anchorX = components.getComponent(petId, "Transform")?.position.x ?? 0;
      // A round only reacts to pulses that land after it starts; whatever the
      // agent did before is not this course.
      session.lastPulseAt = components.getComponent(petId, "AgentActivitySignal")?.at ?? 0;
      session.endedAt = 0;
      return true;
    },
    /** End the running session, whichever pet it was on. */
    endGame(): void {
      const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
      if (!session) return;
      // The course hands the pet's gravity back itself when a round *finishes*
      // (see holdPetAloft), but this ends one outright: after the next line
      // nothing knows which pet was running, so a pet stopped mid-jump would
      // keep the round's lighter gravity for the rest of its life.
      if (session.petId) physics.setGravityScale(session.petId, 1);
      session.petId = null;
      session.phase = "over";
    },
    /** The pet currently on a course, or null when no game is running. */
    gamePetId(): string | null {
      return components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession")?.petId ?? null;
    },
    /**
     * The running session, for a host deciding what its own controls should do
     * next — which pet, and what the course is being made of.
     */
    gameSession(): { petId: string | null; spawn: GameSpawnSource; phase: GamePhase } | null {
      const session = components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
      if (!session) return null;
      return { petId: session.petId, spawn: session.spawn, phase: session.phase };
    },
    /**
     * Host-facing entry point for Quiet Mode: how much the pets may intrude.
     * Deliberately a setter on the live world rather than a world definition —
     * a rebuild would send every pet back to its spawn point, which is a high
     * price for a setting the user flips to be left alone for a minute.
     */
    setQuietMode(next: QuietMode) {
      quietMode = next;
    },
    quietMode() {
      return quietMode;
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
        quietMode,
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
        props: getWorldPropSnapshots(
          components,
          new Map(physicsSnapshot.bodies.map((body) => [body.id, body.angle ?? 0])),
        ),
      };
    },
  };
}
