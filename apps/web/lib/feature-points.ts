/**
 * The feature section's points, in tab order, each paired with the demo clip
 * the READMEs already use for that behaviour. The READMEs embed the GIF; the
 * site plays the MP4 that scripts/encode-demo-videos.mjs derives from it. Both
 * are synced into `public/demo/` by scripts/sync-demo-assets.mjs.
 *
 * `petdex` is wearing borrowed footage: `part1` shows pet selection, not a
 * Petdex install. Its `alt` describes the clip that actually plays rather than
 * the point it sits under, so it stays honest until the real clip is shot —
 * re-word it with the swap.
 *
 * This sits in `lib/` rather than beside the section because two places need
 * the same list: the section itself, and the layout's JSON-LD, which builds the
 * SoftwareApplication `featureList` from these keys.
 */
export const FEATURE_POINTS = [
  { key: "agents", clip: "codex" },
  { key: "status", clip: "part4" },
  { key: "cli", clip: "part2" },
  { key: "petdex", clip: "part1" },
  { key: "skills", clip: "orca" },
  { key: "alive", clip: "play" },
] as const;

export type FeaturePointKey = (typeof FEATURE_POINTS)[number]["key"];
