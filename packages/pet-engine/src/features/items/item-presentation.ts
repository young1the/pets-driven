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
