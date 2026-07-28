/**
 * Desktop trinkets: the non-pet entities the world scatters so an ordinary pet
 * can become something it was not built as.
 *
 * Every adopted pet is spawned as a grounded walker (see buildAdoptedPetEntity)
 * — nothing in the live world ever hands one `CanFly` or `CanWallClimb`, so
 * flight and wall-climbing existed only in fixtures. A trinket is how a pet
 * earns one: it lies on the floor, a pet walks over to it, and the capability
 * component moves onto the pet for a while.
 */

/**
 * What a trinket grants.
 * - `wings` → flight (`CanFly` + `FlyingTag`, gravity off)
 * - `claws` → wall-climbing (`CanWallClimb`)
 */
export type PetItemKind = "wings" | "claws";

/** A trinket lying on the desktop, waiting for a pet to reach it. */
export type WorldItemComponent = {
  type: "WorldItem";
  kind: PetItemKind;
  droppedAt: number;
  /** Uncollected trinkets fade away, so the desktop never silts up with them. */
  expiresAt: number;
  /** Half-extents of the collection box around the trinket's centre. */
  pickupRadius: number;
};

/**
 * The ability a pet is currently wearing.
 *
 * A pet carries at most one: grabbing a second trinket trades the first away.
 * That is what keeps revocation honest — the capability components a pet holds
 * are always exactly the ones this record accounts for, so wearing off never
 * has to guess which of them the pet owned to begin with.
 */
export type CarriedItemComponent = {
  type: "CarriedItem";
  kind: PetItemKind;
  pickedUpAt: number;
  expiresAt: number;
};

/**
 * Singleton scheduler that keeps trinkets appearing on the desktop floor.
 * Lives on its own entity so the drop cadence is world state a scenario tunes,
 * not a constant baked into the system.
 */
export type ItemSpawnerComponent = {
  type: "ItemSpawner";
  /** The pool a drop is chosen from. Empty disables dropping entirely. */
  kinds: PetItemKind[];
  nextDropAt: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  /** Uncollected trinkets alive at once; a full desktop skips the drop. */
  maxOnScreen: number;
  itemLifetimeMs: number;
  /** How long a collected ability stays on the pet. */
  abilityDurationMs: number;
  /** Monotonic counter behind each dropped trinket's entity id. */
  dropped: number;
};

export const ITEM_SPAWNER_ENTITY_ID = "item-spawner";

/** Collection box half-extent, added to the pet's own half-size on pickup. */
export const DEFAULT_ITEM_PICKUP_RADIUS = 28;

/**
 * How tall a trinket sits, used to rest it on the floor and to size the glyph
 * hosts draw for it. Not a physics body — a trinket is a marker with a
 * Transform, like ClimbableSurface, so it never collides with a pet.
 */
export const ITEM_RENDER_SIZE = { width: 32, height: 32 } as const;

/** Sparkle cue shown on the pet at the moment it collects something. */
export const ITEM_PICKUP_CUE_MS = 1_500;

/**
 * Default cadence. Deliberately sparse: a trinket is an occasional event that
 * makes a familiar pet briefly surprising, not a constant stream of pickups.
 */
export const DEFAULT_ITEM_SPAWNER = {
  kinds: ["wings", "claws"] as PetItemKind[],
  firstDropDelayMs: 20_000,
  minIntervalMs: 45_000,
  maxIntervalMs: 120_000,
  maxOnScreen: 2,
  itemLifetimeMs: 90_000,
  abilityDurationMs: 60_000,
} as const;

/**
 * Build the spawner component for a scenario. `now` seeds the first drop so a
 * world built at a non-zero clock still waits the full delay before its first
 * trinket appears.
 */
export function createItemSpawner(
  now = 0,
  overrides?: Partial<Omit<ItemSpawnerComponent, "type" | "dropped">> & {
    firstDropDelayMs?: number;
  },
): ItemSpawnerComponent {
  const { firstDropDelayMs, nextDropAt, ...rest } = overrides ?? {};
  return {
    type: "ItemSpawner",
    kinds: [...DEFAULT_ITEM_SPAWNER.kinds],
    minIntervalMs: DEFAULT_ITEM_SPAWNER.minIntervalMs,
    maxIntervalMs: DEFAULT_ITEM_SPAWNER.maxIntervalMs,
    maxOnScreen: DEFAULT_ITEM_SPAWNER.maxOnScreen,
    itemLifetimeMs: DEFAULT_ITEM_SPAWNER.itemLifetimeMs,
    abilityDurationMs: DEFAULT_ITEM_SPAWNER.abilityDurationMs,
    ...rest,
    nextDropAt: nextDropAt ?? now + (firstDropDelayMs ?? DEFAULT_ITEM_SPAWNER.firstDropDelayMs),
    dropped: 0,
  };
}
