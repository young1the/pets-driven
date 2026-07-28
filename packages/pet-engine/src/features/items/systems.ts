import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import {
  DEFAULT_ITEM_PICKUP_RADIUS,
  DEFAULT_ITEM_SPAWNER,
  ITEM_PICKUP_CUE_MS,
  ITEM_RENDER_SIZE,
  type PetItemKind,
} from "@pets-driven/pet-engine/features/items/components";
import { DEFAULT_PET_CLIMB_VELOCITY } from "@pets-driven/pet-engine/pets/constants/pet-body";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * Trinket lifecycle: drop → collect → wear off.
 *
 * Granting and revoking are the interesting half. A capability component alone
 * is not enough to change how a pet moves — the locomotion tags decide which
 * force system owns the body — so each grant swaps the tag set over with the
 * capability, and each revoke puts it back. Revocation also has to undo the
 * side effects a capability left on the *physics* body, which is why these
 * functions take a gravity writer: `FlightSystem` zeroes a flier's gravity
 * every tick from `CanFly`, and once `CanFly` is gone nothing would ever set it
 * back — the pet would simply hang in the air.
 */

/** The physics surface these systems need; narrowed so tests need no engine. */
export type GravityScaleWriter = {
  setGravityScale(id: string, scale: number): void;
};

/** A stretch of walkable floor a trinket can be dropped onto. */
export type DesktopFloorSpan = {
  minX: number;
  maxX: number;
  /** World y of the floor's top surface. */
  topY: number;
};

/** Keeps a trinket clear of the side walls it would otherwise sit inside. */
const FLOOR_SPAN_MARGIN = 64;

/**
 * The floors a trinket may land on, derived from the monitor boundary bodies.
 *
 * Boundaries carry no edge marker — `createMonitorBoundaryEntities` encodes the
 * edge in the entity id alone — so a floor is recognised by shape and place: a
 * horizontal slab whose top surface is inside the viewport. Ceilings sit
 * entirely above the viewport's top edge and are excluded by exactly that test,
 * which is what keeps trinkets off the sky in a multi-monitor layout.
 */
export function desktopFloorSpans(
  components: ComponentStore,
  bounds: { x?: number; y?: number; width: number; height: number },
): DesktopFloorSpan[] {
  const viewportTop = bounds.y ?? 0;
  const spans: DesktopFloorSpan[] = [];

  components.forEach(["Ground", "Transform", "PhysicsBody"], (_id, [, transform, body]) => {
    if (body.shape !== "rectangle") return;
    if (body.width <= body.height) return;
    const topY = transform.position.y - body.height / 2;
    if (topY < viewportTop) return;
    const minX = transform.position.x - body.width / 2 + FLOOR_SPAN_MARGIN;
    const maxX = transform.position.x + body.width / 2 - FLOOR_SPAN_MARGIN;
    if (maxX <= minX) return;
    spans.push({ minX, maxX, topY });
  });

  // The component store iterates insertion order, which is stable for a given
  // scenario, but sorting makes the pick reproducible across any store that is
  // not — determinism is the engine's contract.
  spans.sort((a, b) => a.topY - b.topY || a.minX - b.minX);
  return spans;
}

function pickIndex(random: RandomSource, length: number): number {
  return Math.min(length - 1, Math.floor(random.next() * length));
}

// ── Drop ───────────────────────────────────────────────────────────────────

/** What a single drop needs to know, independent of who triggered it. */
export type WorldItemDropParams = {
  /** The pool the trinket's kind is chosen from. */
  kinds: PetItemKind[];
  /** How long the dropped trinket lies on the floor before it fades. */
  itemLifetimeMs: number;
  /** Half-extent of its collection box. */
  pickupRadius: number;
};

/**
 * Drop one random trinket onto a desktop floor at `now`, tagging its entity id
 * with `sequence`. The one place a WorldItem is ever created, shared by the
 * scheduled ItemSpawner and by a host-driven manual drop (the main window's
 * mystery-box button). Returns the new entity id, or null when there was
 * nowhere to place one — an empty kind pool or no floor in view.
 *
 * Capacity (maxOnScreen) is deliberately the caller's concern: the scheduled
 * drop skips a full desktop, a manual drop does not.
 */
export function dropRandomWorldItem(
  components: ComponentStore,
  random: RandomSource,
  bounds: { x?: number; y?: number; width: number; height: number },
  now: number,
  params: WorldItemDropParams,
  sequence: number,
): string | null {
  if (params.kinds.length === 0) return null;
  const spans = desktopFloorSpans(components, bounds);
  if (spans.length === 0) return null;

  const span = spans[pickIndex(random, spans.length)];
  const kind = params.kinds[pickIndex(random, params.kinds.length)];
  const id = `item-${kind}-${sequence}`;

  components.spawn(id, [
    {
      type: "WorldItem",
      kind,
      droppedAt: now,
      expiresAt: now + params.itemLifetimeMs,
      pickupRadius: params.pickupRadius,
    },
    {
      type: "Transform",
      position: {
        x: span.minX + random.next() * (span.maxX - span.minX),
        y: span.topY - ITEM_RENDER_SIZE.height / 2,
      },
    },
  ]);

  return id;
}

export function runItemSpawnSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  // Sweep faded trinkets first, so a fade-out frees its slot the same tick.
  const stale: string[] = [];
  components.forEach(["WorldItem"], (id, [item]) => {
    if (item.expiresAt <= now) stale.push(id);
  });
  for (const id of stale) {
    components.destroy(id);
  }

  components.forEach(["ItemSpawner"], (_id, [spawner]) => {
    if (now < spawner.nextDropAt) return;

    const blocked =
      spawner.kinds.length === 0 || components.components("WorldItem").size >= spawner.maxOnScreen;
    const dropped = blocked
      ? null
      : dropRandomWorldItem(
          components,
          random,
          bounds,
          now,
          {
            kinds: spawner.kinds,
            itemLifetimeMs: spawner.itemLifetimeMs,
            pickupRadius: DEFAULT_ITEM_PICKUP_RADIUS,
          },
          spawner.dropped,
        );

    if (!dropped) {
      // Retry on the short end of the cadence rather than burning a full
      // interval — the block (a full desktop, a world still being built) is
      // usually gone well before the next scheduled drop would come round.
      spawner.nextDropAt = now + spawner.minIntervalMs;
      return;
    }

    spawner.dropped += 1;
    spawner.nextDropAt =
      now +
      spawner.minIntervalMs +
      random.next() * Math.max(0, spawner.maxIntervalMs - spawner.minIntervalMs);
  });
}

// ── Collect ────────────────────────────────────────────────────────────────

/**
 * Move a trinket's capability onto a pet, swapping its locomotion tags over so
 * the right force system takes the body. Trading an ability the pet already
 * wears revokes that one first, so the two never overlap.
 */
export function grantItemAbility(
  components: ComponentStore,
  physics: GravityScaleWriter | undefined,
  petId: string,
  kind: PetItemKind,
  now: number,
  durationMs: number,
): void {
  const carried = components.getComponent(petId, "CarriedItem");
  if (carried && carried.kind !== kind) {
    revokeItemAbility(components, physics, petId, carried.kind);
  }

  switch (kind) {
    case "wings":
      // Flight is owned by SteeringForceSystem + FlightSystem, which key off
      // FlyingTag; leaving WalkingTag on would let WalkSystem and JumpSystem
      // keep fighting them for the same body.
      components.removeComponent(petId, "WalkingTag");
      components.removeComponent(petId, "AirborneTag");
      components.removeComponent(petId, "JumpActionState");
      components.removeComponent(petId, "ClimbingTag");
      components.removeComponent(petId, "ClimbIntentState");
      components.setComponent(petId, { type: "CanFly", gravityScale: 0, hoverStrength: 0 });
      components.setComponent(petId, { type: "FlyingTag" });
      physics?.setGravityScale(petId, 0);
      break;
    case "claws":
      // Climbing keeps the pet a walker: it still crosses the floor to reach a
      // surface, and LocomotionModeSystem trades the tags at the wall. The
      // default velocity needs no body-size scaling the way walk force does —
      // WallClimbSystem sets velocity outright, so mass never enters into it.
      components.setComponent(petId, {
        type: "CanWallClimb",
        velocity: DEFAULT_PET_CLIMB_VELOCITY,
      });
      break;
  }

  components.setComponent(petId, {
    type: "CarriedItem",
    kind,
    pickedUpAt: now,
    expiresAt: now + durationMs,
  });
  components.setComponent(petId, {
    type: "PetExpressionState",
    source: "item",
    mood: "excited",
    emote: "sparkle",
    label: null,
    startedAt: now,
    expiresAt: now + ITEM_PICKUP_CUE_MS,
  });
}

/** Take an ability back off a pet and leave it a plain walker again. */
export function revokeItemAbility(
  components: ComponentStore,
  physics: GravityScaleWriter | undefined,
  petId: string,
  kind: PetItemKind,
): void {
  switch (kind) {
    case "wings":
      // A pet with no CanWalk has nothing to come back down to: stripping
      // flight would leave it holding no locomotion tag at all, and no force
      // system owns a pet like that — it would sink to the floor and never move
      // again. Such a pet was a flier before it ever touched the wings, so
      // leaving it flying is also the honest outcome.
      if (!components.getComponent(petId, "CanWalk")) break;
      components.removeComponent(petId, "FlyingTag");
      components.removeComponent(petId, "CanFly");
      // FlightSystem was the only thing holding gravity off, and it reads
      // CanFly — which is now gone. Without this the pet floats forever.
      physics?.setGravityScale(petId, 1);
      break;
    case "claws":
      components.removeComponent(petId, "CanWallClimb");
      // A climb in progress has no system left to own it: LocomotionModeSystem
      // and WallClimbSystem both require CanWallClimb, so the pet would keep
      // ClimbingTag — and its frozen velocity — for good.
      components.removeComponent(petId, "ClimbingTag");
      components.removeComponent(petId, "ClimbIntentState");
      components.removeComponent(petId, "ClimbDismountState");
      break;
  }

  if (components.getComponent(petId, "CanWalk")) {
    components.setComponent(petId, { type: "WalkingTag" });
  }
}

export function runItemPickupSystem(
  components: ComponentStore,
  clock: Clock,
  physics?: GravityScaleWriter,
): void {
  const items = components.query("WorldItem", "Transform");
  if (items.length === 0) return;

  const now = clock.now();
  // The scenario owns how long an ability lasts; fall back to the tuned default
  // for a world that scatters trinkets without running a spawner.
  const spawner = components.components("ItemSpawner").values().next().value;
  const durationMs = spawner?.abilityDurationMs ?? DEFAULT_ITEM_SPAWNER.abilityDurationMs;

  const collected = new Set<string>();

  components.forEach(["PetIdentity", "Transform"], (petId, [, transform]) => {
    const body = components.getComponent(petId, "PhysicsBody");
    const halfWidth = body?.shape === "rectangle" ? body.width / 2 : 0;
    const halfHeight = body?.shape === "rectangle" ? body.height / 2 : 0;

    for (const entry of items) {
      if (collected.has(entry.id)) continue;
      const [item, itemTransform] = entry.components;
      const dx = Math.abs(itemTransform.position.x - transform.position.x);
      const dy = Math.abs(itemTransform.position.y - transform.position.y);
      // A box test rather than a radius: a tall pet standing over a trinket on
      // the floor is far from it centre-to-centre, but is plainly on top of it.
      if (dx > item.pickupRadius + halfWidth) continue;
      if (dy > item.pickupRadius + halfHeight) continue;

      collected.add(entry.id);
      grantItemAbility(components, physics, petId, item.kind, now, durationMs);
      // One trinket per pet per tick — a pet standing on a pile takes the rest
      // on later ticks, and each pickup gets its own cue.
      break;
    }
  });

  for (const id of collected) {
    components.destroy(id);
  }
}

// ── Wear off ───────────────────────────────────────────────────────────────

export function runItemAbilityExpirySystem(
  components: ComponentStore,
  clock: Clock,
  physics?: GravityScaleWriter,
): void {
  const now = clock.now();
  const expired: Array<{ petId: string; kind: PetItemKind }> = [];

  components.forEach(["CarriedItem"], (petId, [carried]) => {
    if (carried.expiresAt <= now) expired.push({ petId, kind: carried.kind });
  });

  for (const entry of expired) {
    revokeItemAbility(components, physics, entry.petId, entry.kind);
    components.removeComponent(entry.petId, "CarriedItem");
  }
}

// ── System descriptors ─────────────────────────────────────────────────────

export const ItemSpawnSystem: SimulationSystem<WorldStepContext> = {
  name: "ItemSpawnSystem",
  dependsOn: ["PhysicsTransformSyncSystemPre"],
  reads: ["ItemSpawner", "WorldItem", "Ground", "Transform", "PhysicsBody"],
  writes: ["ItemSpawner", "WorldItem", "Transform"],
  update(ctx) {
    runItemSpawnSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
};

export const ItemPickupSystem: SimulationSystem<WorldStepContext> = {
  name: "ItemPickupSystem",
  dependsOn: ["ItemSpawnSystem"],
  reads: ["WorldItem", "Transform", "PetIdentity", "PhysicsBody", "ItemSpawner", "CarriedItem"],
  writes: [
    "WorldItem",
    "CarriedItem",
    "CanFly",
    "CanWallClimb",
    "FlyingTag",
    "WalkingTag",
    "AirborneTag",
    "ClimbingTag",
    "ClimbIntentState",
    "JumpActionState",
    "PetExpressionState",
    "PhysicsGravityScale",
  ],
  update(ctx) {
    runItemPickupSystem(ctx.components, ctx.clock, ctx.physics);
  },
};

export const ItemAbilityExpirySystem: SimulationSystem<WorldStepContext> = {
  name: "ItemAbilityExpirySystem",
  dependsOn: ["ItemPickupSystem"],
  reads: ["CarriedItem", "CanWalk"],
  writes: [
    "CarriedItem",
    "CanFly",
    "CanWallClimb",
    "FlyingTag",
    "WalkingTag",
    "ClimbingTag",
    "ClimbIntentState",
    "ClimbDismountState",
    "PhysicsGravityScale",
  ],
  update(ctx) {
    runItemAbilityExpirySystem(ctx.components, ctx.clock, ctx.physics);
  },
};
