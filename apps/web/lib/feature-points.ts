/**
 * The feature section's points, in tab order, each paired with its demo clip.
 * The READMEs embed the GIF under `docs/assets/`, which is the authored source
 * of truth; the site plays the MP4 that scripts/encode-demo-videos.mjs derives
 * from it, behind the first-frame WebP poster beside it. Both are synced into
 * `public/demo/` by scripts/sync-demo-assets.mjs.
 *
 * Every point plays footage of the behaviour it describes, and each `alt` says
 * what its clip shows. A point whose clip has to be borrowed is worth calling
 * out here and wording its `alt` after the clip rather than the point — the
 * section spent a while with two of those, and a caption that describes the
 * point instead of the picture is the part that goes stale silently.
 *
 * `alive` plays `play` (pets socialising with nothing running) while `play`
 * plays `ball` (a pet with a ball, on a course) — those two clip names predate
 * the point names and do not line up one-to-one. Everything else is named after
 * the point it belongs to.
 *
 * `bind` is the one point whose body is wider than its clip: a pet binds to any
 * top-level window (`connect_window` filters out only our own windows and the
 * desktop), while the footage binds a terminal. The body says what the feature
 * does and the `alt` says what the picture shows — a clip of a browser being
 * bound would let the two meet.
 *
 * Two clips under `docs/assets/` are no longer played here and stay only
 * because the READMEs embed them: `orca` (the `worktree` panel has footage of
 * the app's own branch-this-folder flow, which is the point it makes) and
 * `codex` (the hooks point merged into `agents`, which leads with the status a
 * run produces rather than the wiring that carries it).
 *
 * This sits in `lib/` rather than beside the section because two places need
 * the same list: the section itself, and the layout's JSON-LD, which builds the
 * SoftwareApplication `featureList` from these keys.
 */
export const FEATURE_POINTS = [
  { key: "agents", clip: "state" },
  { key: "worktree", clip: "worktree" },
  { key: "cli", clip: "cli" },
  { key: "alive", clip: "play" },
  { key: "play", clip: "ball" },
  { key: "bind", clip: "bind" },
  { key: "petdex", clip: "petdex" },
] as const;

export type FeaturePointKey = (typeof FEATURE_POINTS)[number]["key"];
