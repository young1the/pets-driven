import type { PetItemKind } from "@pets-driven/pet-engine/features/items/components";

/**
 * How a trinket reads on screen, mapped once here so the playground canvas and
 * the desktop overlay window never drift into drawing two different things for
 * the same entity. Colour is deliberately absent: hosts own their palette (the
 * engine depends on nothing in the workspace, design tokens included).
 */
export type WorldItemPresentation = {
  /**
   * The glyph hosts draw. Deliberately long-established codepoints rather than
   * the literal 🪽 / 🪝 — those are Unicode 13/14 and still render as tofu on
   * plenty of Windows installs, which is exactly where this ships.
   */
  glyph: string;
  /** English fallback label; hosts with a catalogue translate by kind instead. */
  label: string;
};

export const WORLD_ITEM_PRESENTATION: Record<PetItemKind, WorldItemPresentation> = {
  wings: { glyph: "🕊️", label: "Wings" },
  claws: { glyph: "⛏️", label: "Climbing claws" },
};

export function presentWorldItem(kind: PetItemKind): WorldItemPresentation {
  return WORLD_ITEM_PRESENTATION[kind];
}

/**
 * How close a trinket is to fading, 0 (fresh) to 1 (gone). Hosts use it to
 * blink one out rather than have it vanish between frames.
 */
export function worldItemFadeProgress(
  item: { expiresAt: number },
  now: number,
  fadeMs = 5_000,
): number {
  const remaining = item.expiresAt - now;
  if (remaining <= 0) return 1;
  if (remaining >= fadeMs) return 0;
  return 1 - remaining / fadeMs;
}

/** Seconds left at which a host should start warning that the ability is going. */
export const CARRIED_ITEM_WARNING_SECONDS = 10;

/**
 * The countdown on an ability a pet is wearing.
 *
 * Whole seconds, not milliseconds, and that is the point: this rides a
 * cross-window frame stream where every changed field costs an emit, so a
 * per-tick float would repaint each carrier's window sixty times a second for a
 * number no one can read at that resolution. At one step per second a host can
 * ease between steps and get a smooth sweep for a payload that changes sixty
 * times over a whole minute-long grant.
 */
export type CarriedItemCountdown = {
  /**
   * Whole seconds until the ability is revoked. Rounded up, so it reads 1 for
   * the pet's last second and only reaches 0 once the ability is actually gone.
   */
  remainingSeconds: number;
  /** The full grant in seconds, so a host knows the sweep the countdown is of. */
  totalSeconds: number;
};

export function carriedItemCountdown(
  carried: { pickedUpAt: number; expiresAt: number },
  now: number,
): CarriedItemCountdown {
  return {
    remainingSeconds: Math.max(0, Math.ceil((carried.expiresAt - now) / 1_000)),
    // Floored at one so a host dividing by it for a progress sweep is safe even
    // for a grant shorter than a second (only a scenario tunes it that low).
    totalSeconds: Math.max(1, Math.round((carried.expiresAt - carried.pickedUpAt) / 1_000)),
  };
}
