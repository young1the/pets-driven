import type { WorldPropKind } from "@pets-driven/pet-engine/features/props/components";

/**
 * What a prop is called. Deliberately *only* a name — unlike
 * WORLD_ITEM_PRESENTATION, there is no glyph here.
 *
 * A trinket is a marker, and a text character is an honest picture of one: it
 * lies still, it is the same at every size, and one emoji says the whole thing.
 * A prop is a body. It has volume, it is lit, and it rotates with the physics
 * angle as it rolls — none of which a glyph can carry, and the attempt looked
 * it: the ball shipped as ⚽ and read as a flat sticker from the system emoji
 * font sitting beside soft shaded sprites.
 *
 * So the drawing lives with the host that owns the palette
 * (`apps/desktop/src/artwork/prop-artwork.ts`), and this catalogue keeps the
 * one thing every host needs and none should invent: the accessible name.
 */
export type WorldPropPresentation = {
  /** English fallback label; hosts with a catalogue translate by kind instead. */
  label: string;
};

export const WORLD_PROP_PRESENTATION: Record<WorldPropKind, WorldPropPresentation> = {
  ball: { label: "Ball" },
};

export function presentWorldProp(kind: WorldPropKind): WorldPropPresentation {
  return WORLD_PROP_PRESENTATION[kind];
}
