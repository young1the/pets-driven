import type { WorldPropKind } from "@pets-driven/pet-engine/features/props/components";

/**
 * What a prop is called, and — for the ones a glyph can honestly stand for —
 * what to draw.
 *
 * The ball has no glyph on purpose. A trinket is a marker, and a text character
 * is an honest picture of one: it lies still, it is the same at every size, and
 * one emoji says the whole thing. The ball is a body that has volume, is lit,
 * and rotates with the physics angle as it rolls — none of which a glyph can
 * carry, and the attempt looked it: it shipped as ⚽ and read as a flat sticker
 * from the system emoji font sitting beside soft shaded sprites. Its drawing
 * lives with the host that owns the palette
 * (`apps/desktop/src/artwork/prop-artwork.ts`).
 *
 * A hurdle is the other case. It is course scenery that slides past at a
 * constant speed and never turns, so a glyph is the whole of it — and the
 * course vocabulary this becomes (a stack of books for reading, a wrench for
 * editing) is read as symbols rather than objects anyway.
 */
export type WorldPropPresentation = {
  /** Drawn as a glyph when the prop has no bespoke artwork. The ball has art. */
  glyph?: string;
  /** English fallback label; hosts with a catalogue translate by kind instead. */
  label: string;
};

export const WORLD_PROP_PRESENTATION: Record<WorldPropKind, WorldPropPresentation> = {
  ball: { label: "Ball" },
  hurdle: { label: "Hurdle", glyph: "🌵" },
  "book-stack": { label: "Reading", glyph: "📚" },
  toolbox: { label: "Editing", glyph: "🔧" },
  flame: { label: "Running something", glyph: "🔥" },
  gate: { label: "Waiting for you", glyph: "🚧" },
  finish: { label: "Finish", glyph: "🏁" },
  wall: { label: "Failed", glyph: "🧱" },
};

export function presentWorldProp(kind: WorldPropKind): WorldPropPresentation {
  return WORLD_PROP_PRESENTATION[kind];
}
