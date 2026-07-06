# Behavior backlog — collision as a social event

Context: pets currently re-decide too eagerly whenever bodies overlap. The
collision source (priority 3) outranks social (priority 4), so any contact
tears down a running session ([social/systems.ts] `advanceSessions` →
`isBlockedByHigherPriority`), chase sessions self-destruct at the catch moment
(the chaser's target is the runner's own position), and every overlap re-runs
the freeze → react → move pipeline with no per-pair memory. The direction
agreed on 2026-07-05: strengthen social and reinterpret most pet-to-pet
collisions as *social events*, keeping the reactive collision pool as a
fallback for non-social contact.

Items are ordered by dependency and risk; B1–B3 are safe plumbing, B4 is the
feature payoff. Each item should land with its own tests and keep
`pnpm --filter @pets-driven/pet-engine test` green.

---

## B1. Swap priority: social outranks collision — DONE (2026-07-05)

**Problem** — A live `SocialSession` is torn down by the physical contact it
naturally produces (greet gap ≈ 2 body widths, chase = guaranteed overlap).

**Change**
- `BEHAVIOR_PRIORITY` in `features/behavior/components.ts`: social 3,
  collision 4. Update the comment that currently documents the old ordering
  ("a collision … still interrupts it") — this is a deliberate reversal.
- Audit every `isClaimed` / `isBlockedByHigherPriority` call site for
  assumptions about the old order (behavior systems, social systems,
  `WORKING_COLLISION_EXPIRABLE_AUTONOMOUS_REASONS` interplay).

**Acceptance**
- A seeded two-pet chat session survives a `PetCollision` component appearing
  on a participant mid-session (new test).
- Collision still interrupts autonomous behaviors (wander/romp) — existing
  collision tests stay green.

**Risk** — Working pets: `CollisionBehaviorSystem` has a special working-pet
path that must keep functioning when the working pet is *also* in a session
(should not happen — sessions exclude working pets at invite time — but the
teardown path must not regress).

Size: S. Depends on: nothing.

**Outcome** — Landed with one addition beyond the plan: collision no longer
outranking social opened a window where a pet frozen in collision
deliberation (`PendingReaction`) could send/accept invites while mid-startle,
leaving a stale reaction to fire after the session. Guarded in
`SocialInteractionSystem` (invite emission, invite resolution) and
`createSession` now clears any lingering `PendingReaction` on both members.
Note: while a social claim is live the pet ignores *all* collisions (not just
partner ones) via the priority guard — B2 narrows the remaining gaps
(escape-force damping, expiry fiddling) rather than introducing immunity.

## B2. Session-partner collision immunity — DONE (2026-07-05)

**Problem** — Even with B1, a collision claim against one's session partner
still queues `PendingReaction` and churns state the moment the session ends.

**Change**
- In `runCollisionBehaviorSystem` pass 2: skip the entity when the collision
  candidate id equals its `SocialSessionMember.partnerId`.
- Also skip pass-1 claim expiry fiddling for partner overlaps (they are
  expected, not stale state).
- Physical separation remains `CollisionEscapeSystem`'s job (claim-independent
  force), so partners can still not clip through each other. Consider damping
  the escape force multiplier (currently 4x) to ~1x while both parties share a
  session, so a standing chat doesn't visibly shove.

**Acceptance**
- Partner overlap during a session produces no `PendingReaction`, no
  collision claim, no expression change (new test).
- Non-partner collision during a session still registers (the third pet
  bumping into a chatting pair gets its normal reaction; with B1 the chatting
  pair itself stays committed).

Size: S. Depends on: B1 (order only; technically independent).

**Outcome** — Partner overlaps are skipped in pass 2 of
`CollisionBehaviorSystem` (covers the claim-gap windows B1 left), and
`CollisionEscapeSystem` separates session partners at base force only — no
4x multiplier, no stuck escalation. Pass 1 needed no change: session members
never hold collision claims in the first place.

## B3. Per-pair collision reaction cooldown — DONE (2026-07-05)

**Problem** — A pet that just reacted to pet X re-reacts to X on the next
overlap (collision claim lasts only 1s), producing the rapid behavior
flip-flop when pets cluster.

**Change**
- New component `CollisionMemory { entries: Array<{ otherId, lastReactedAt }> }`
  (or a bounded map) written by `runCollisionBehaviorSystem` when a
  `PendingReaction` is created.
- Pass 2 skips a candidate pair whose last reaction is younger than
  `PAIR_COLLISION_COOLDOWN_MS` (start at 6_000; tune on desktop).
- Entries expire lazily; cap the list (pets rarely know more than a handful of
  neighbors).
- `CollisionEscapeSystem` is *not* gated — bodies still separate; only the
  behavioral re-reaction is suppressed.

**Acceptance**
- Two overlapping pets react once, then coexist without new reactions until
  the cooldown lapses (new test stepping a seeded world).
- The demo scenario no longer shows sub-second decision churn when three pets
  cluster (manual check via DecisionShowcase / desktop playground).

Size: M. Depends on: nothing (compounds with B1/B2).

**Outcome** — `CollisionMemory` (bounded, lazily pruned) + 6s
`PAIR_COLLISION_COOLDOWN_MS`; recorded on both the PendingReaction path and
the working-pet expression path, so working pets also stop re-emoting every
overlap. Fallout worth remembering: the dual-monitor world-fixtures test
("climb pet enters the left monitor") had been passing by riding exactly the
collision churn this removes — pet-c crossed via rapid-fire collision-jump
pinball at the seam wall base, not via its scripted high climb (the old
-0.024 dismount impulse air-decayed into a straight drop). Fixed by raising
the dual-fixture dismount impulse to -0.06 so a top dismount genuinely
glides across the open seam (y 0..960), and by re-scripting the climb in the
test with retries instead of waiting on 20s of emergent chaos.

## B4. Bump-to-greet: collision as a social on-ramp — DONE (2026-07-05)

**Problem** — A friendly bump between two idle, socializable pets currently
routes into the flee/avoid/engage pool; `collision-engage` walks the pets near
each other and stops — a dead end instead of an interaction.

**Change**
- In the `PendingReaction` branch of `runBehaviorDecisionSystem` (or better:
  intercept earlier in `SocialInteractionSystem`, which owns invites): when
  BOTH parties have `CanSocialize`, neither is in a session, neither is
  working/held, convert the collision into a `SocialInvite` from the reacting
  pet (kind picked by `pickKind`, likely biased toward greet) instead of
  sampling the reactive pool.
- Gate by personality: reuse `initiateScore`-style scoring; a high-N/low-A pet
  keeps its flee/avoid reaction (the decline path already animates a shrug).
- Remove or down-weight `collision-engage` once this lands — bump-to-greet
  supersedes it (keep the kind for non-socializable fallback, or delete and
  migrate presentation/i18n entries).
- The invite path must respect B3's pair cooldown so a declined bump does not
  re-invite on the very next overlap.

**Acceptance**
- Seeded test: two idle agreeable pets overlap → a greet session forms within
  one invite round-trip; no collision-flee/avoid tokens emitted.
- Seeded test: shy pet (high N, low A) still flees on bump.
- i18n/presentation: no raw keys leak (check `decisionKinds`,
  `DECISION_ACTIVITY`, `getPetVisualCue`, `BEHAVIOR_TOKEN_PRESENTATION` if
  `collision-engage` is removed).

Size: L. Depends on: B1, B2, B3.

**Outcome** — Implemented as a `convertBumpsToInvites` pass inside
`SocialInteractionSystem` (which owns invites), running between invite
resolution and emission. It fires exactly when a collision deliberation
matures (`now >= reactsAt`, preserving the visible startle beat): a
personality/drive-weighted roll (`bumpInviteChance`, clamps to 0 for
high-N/low-A pets) converts the bump into a SocialInvite — 60% biased to
greet, else `pickKind` — and defuses the partner's own pending startle so a
mutual bump yields one invite, not two crossing reactions. A failed roll
leaves the PendingReaction for BehaviorDecisionSystem, which now drops the
`collision-engage` candidate for bump-eligible pairs (`isBumpSocialEligible`
is shared) — engage remains only as the fallback toward non-socializable
entities, so the kind, its presentation, and i18n entries all stay.
Declined/failed bumps cannot re-invite immediately thanks to B3's pair
cooldown.

## B5. Chase catch moment (polish) — DONE (2026-07-06)

**Problem** — With B1/B2 the chase no longer aborts on contact, but the catch
is anticlimactic: chaser reaches runner and they just keep running the swap
timer.

**Change** — In `choreographChase`, when chaser–runner distance drops below a
catch radius (~1.2 body widths), trigger an immediate role swap plus a short
"caught you!" cue (excited expression + speech line), then continue play.

**Acceptance** — Seeded test: contact during chase swaps roles before
`CHASE_SWAP_MS` elapses and emits the cue once per catch (cooldown so a
lingering overlap doesn't machine-gun the cue).

Size: S. Depends on: B1, B2.

**Outcome** — `choreographChase` now derives roles from an explicit
`chaseSwaps` counter (parity = who chases) instead of raw elapsed time, so a
swap can fire off the swap timer *or* the instant the chaser closes within
`CHASE_CATCH_BODY_WIDTHS` (1.2) of the runner. A catch also speaks a tag line
(`CHASE_CATCH_LINES`) from the catcher and shows an excited/exclaim cue pair,
gated by a 700ms `lastCatchAt` cooldown so a lingering overlap during the
swap-around doesn't machine-gun it. New session fields (`chaseSwaps`,
`lastChaseSwapAt`, `lastCatchAt`) are optional, so older fixtures are
unaffected.

## B6. Social chat surfaces as the "chatting" activity — DONE (2026-07-06)

**Problem** — The status capsule's "chatting" activity is only produced by the
agent idle-companion speech (`"idle conversation"` reason). A pet in a 16s
chat session reads as null/onTheMove instead of chatting.

**Change**
- `DECISION_ACTIVITY` in `core/pet-activity.ts`: add
  `"session-chat": "chatting"` and `"session-greet": "makingFriends"`. For
  `session-chase`, either map to `makingFriends` or introduce a dedicated
  `playingTogether` activity kind — decide during implementation together
  with the pet-status work in flight (uncommitted changes to
  `pet-status-presentation.ts` / `pet-mood.ts` touch the same surface).
- Consider renaming the idle-companion mapping to a distinct kind
  (`checkingIn`) so the two meanings stop sharing a label; requires i18n keys
  in `desktop.json` (`petStatus.*`) for ko/en.

**Acceptance** — During a seeded chat session, `derivePetActivity` returns the
chat activity for both pets across the whole play phase; idle-companion speech
maps to its own (renamed) activity.

Size: S–M (M if the rename is included). Depends on: coordination with the
uncommitted pet-status changes on this branch.

**Outcome** — `DECISION_ACTIVITY` maps `session-greet`→makingFriends,
`session-chat`→chatting, `session-chase`→ a new `playing` activity kind,
plus `social-invite`→makingFriends and `socialized`→foundAFriend for the
afterglow. These resolve even while pets stand still mid-chat because the
session re-claims every tick (claim stays unexpired). Added the `playing`
kind across its exhaustive surfaces (pet-status-presentation label +
presentation, desktop pet-card label, ko/en `petStatus` i18n). The
idle-companion `checkingIn` rename was *not* taken — with B7 the idle
companion and social chat no longer visibly collide, so the shared
"chatting" label is acceptable; left as a future nicety.

## B7. Idle-conversation claim is shorter than its own speech bubble — DONE (2026-07-06)

**Problem** — `"idle conversation"` claims the default autonomous 500ms while
its bubble lives 1.5s; the "chatting" capsule state flickers.

**Change** — Claim for the bubble's lifetime (`SPEECH_BUBBLE_DURATION_MS`, or
bubble + a small tail) via the custom-expiry `claim` parameter in
`runAutonomousBehaviorSystem`.

**Acceptance** — Activity stays "chatting" at least as long as the bubble is
visible (unit test with a manual clock).

Size: XS. Depends on: nothing.

**Outcome** — `runAutonomousBehaviorSystem` now claims the idle-companion
beat for `SPEECH_BUBBLE_DURATION_MS` (1.5s) instead of the 500ms autonomous
default, so the "chatting" activity no longer flickers off a second before
its bubble. (The claim is still a `BOOKKEEPING_AUTONOMOUS_REASON`, so the
longer hold does not clobber repeat-cooldown history or eat arrival dwells.)

## B8. Desktop tuning pass for the new constants

**Problem** — All new feel constants (dwell 0.7–4s, idle-stay 3–15s, romp
cadence, saunter 0.45x, chat 16s, `PAIR_COLLISION_COOLDOWN_MS`) were chosen on
paper and verified only in tests/web showcase, not in the real desktop
overlay with scaled pet bodies (remember: forces scale with body area).

**Change** — Run the Tauri desktop app with 3+ pets for several minutes;
adjust constants; note outcomes here. Watch specifically for: pets perched on
climb surfaces during dwell, escape-force shoving during chats, romp frequency
for high-E pets (energy drain should self-limit; verify).

Size: S (observation) + follow-up tweaks. Depends on: B1–B4 ideally landed
first so one pass covers everything.

## B11. Blocked-path yield: stop cluster trembling — DONE (2026-07-05)

**Problem** — Fallout of B3, observed on desktop: clustered pets tremble.
With per-pair reactions suppressed for 6s, a walker whose target lies behind
another pet keeps pressing into it — walk force vs collision-escape force
fighting every tick (visible vibration) while slowly bulldozing the idle
neighbor across the floor.

**Change** — New `CollisionYieldSystem` (BEHAVIOR, after
CollisionBehaviorSystem): a grounded walker pressing against a pet that sits
between it and its target for ≥900ms gives the target up and takes an
arrival dwell — a blocked path is an arrival. Detection is geometric
(`BlockedPathState` accumulates body-abutment time in the walk direction):
PetCollision age is useless (pressing bodies separate/retouch every few
frames, resetting `startedAt`) and distance progress still trickles in while
bulldozing. Live claims (session chase, romp, deliberation, user hold) are
left alone.

**Outcome** — Headless repro: bulldozed displacement 17px → 4px, in-contact
travel 30px → 9px; the walker now yields ~0.9s after contact and wanders
elsewhere after its dwell.

**Follow-up (same day)** — Desktop still trembled. Colony-level jitter
measurement (visible 1–3px direction flips per pet over 60s) exposed three
more sources the first fix missed:
1. *Convoy bounces*: the escape force knocks a tailgating walker ~6px back
   every few frames, so the touching-only (4px) gap check reset the blocked
   timer on every bounce. Widened to 12px with decay-instead-of-reset.
2. *Unattachable climb approach*: pet-a oscillated at a climb wall forever
   when attachment never fired (300 flips/min, the single worst source).
   `ClimbIntentState.startedAt` + 6s timeout in ClimbApproachSystem, with
   the request-climb repeat cooldown refreshed on cancel. Why the demo's
   alice-climb-wall never attaches is still an open question (fixture
   geometry), but no pet pins itself to a wall anymore.
3. *Idle-speech claim churn*: "idle conversation" re-claims every ~1.5s,
   clobbering repeat-cooldown history and eating arrival dwells (instant
   re-decisions after arrivals). It is now a bookkeeping reason alongside
   arrival-dwell (`BOOKKEEPING_AUTONOMOUS_REASONS`).

Colony visible-flip total: 880 → 354 per 60s. The remainder is pet-a's
6s-on/6s-off retry cycle against the unclimbable demo wall.

## B12. Ghost bodies: delete pet-to-pet physical collision — DONE (2026-07-06)

**Problem** — Even after B11 and its follow-ups, clustered pets still
trembled on desktop. Every fix in that line was a bandage over the same
root: pets being solid to each other. The physical layer produced grinding,
convoy bounces, bulldozing, and cluster jitter, while contributing almost
nothing the product needs — all *meaningful* pet-to-pet interaction lives in
the social/behavior layer.

**Change** — Pets are now physical ghosts to each other:
- Matter collision filters: dynamic bodies mask `SURFACE` only (gravity,
  floors, walls, jumping, dragging all unchanged).
- `PetCollision` is derived geometrically (nearest overlapping pet AABB) in
  `PetCollisionSyncSystem` — a stable signal with no solver blinking. The
  behavior layer on top (startle → bump-to-greet / reactions, B2 partner
  immunity, B3 pair cooldown) is unchanged.
- Deleted outright: `CollisionEscapeSystem` (separation forces),
  `CollisionYieldSystem` + `BlockedPathState` (B11 — obsolete when nothing
  physically blocks a walker).

**Outcome** — Demo-colony visible-flip metric: 880 (pre-B11) → 354 (B11) →
**56 per 60s** (normal turn-around noise). Net code reduction. Trade-off
(pets could visually stack while idling on the same spot) resolved by the
cosmetic make-room shuffle below.

### B12a. Personal-space make-room shuffle — DONE (2026-07-06)

Ghost bodies let two idle pets settle on the exact same spot and render
stacked. `PersonalSpaceSystem` (end of BEHAVIOR) gives a genuinely idle,
unclaimed grounded walker overlapping another pet one small step aside — a
low-priority autonomous `make-room` **Decision** that sets a motion target
(handed to Steering) and settles through the normal arrival + dwell path.
It is a motion target, never a force, so it cannot reintroduce grinding;
it skips pets under any live claim (sessions, chases, reactions, holds),
pets boxed against a wall, and honors a 4s repeat cooldown. Stress probe
(three pets forced onto one spot): stacking clears within seconds and the
visible-flip metric stays at turn-around noise (44/60s). CONTEXT.md's
physical-collision language updated to match.

## B9. Surface the session partner in the UI — DONE (2026-07-06)

**Problem** — The engine already exposes per-pet session state in the
snapshot (`pets[].social = { kind, phase, role, partnerId }`, built by
`getSocialSnapshot` in `core/create-world.ts`), but nothing in the desktop
app consumes it. Users can see a pet is "playing with a friend" (visual cue)
but never *which* friend.

**Change**
- Desktop status capsule / pet card: when `social` is non-null, render a
  partner-aware label, e.g. "Chatting with Otto" — resolve `partnerId` to the
  pet's display `name` from the same snapshot.
- i18n: parameterized keys in `desktop.json` (ko/en), e.g.
  `petStatus.chattingWith` with a `{name}` placeholder, per session kind.
- Coordinate with B6: both touch the activity/capsule surface; landing them
  together avoids reworking the same presentation twice.

**Acceptance**
- With a seeded chat session, both pets' cards show the partner's name for
  the whole session; the label clears on teardown (afterglow may keep a
  "made a friend" cue without the name).
- No raw i18n keys leak in either locale.

Size: XS–S. Depends on: B6 (same surface; soft dependency).

**Outcome** — `SocialSnapshot` (now a typed field on `PetSnapshot`, was
runtime-only) carries `partnerName`, resolved engine-side in
`getSocialSnapshot`. The management-surface pet card (`petStatusFromSnapshot`)
picks a partner-aware label for the live social activities — chatting →
`chattingWith`, playing → `playingWith`, making-friends → `makingFriendsWith` —
carrying `labelParams: { name }` that the card localizer interpolates
(`petStatus.*With` = "… with {{name}}", ko/en). Non-social activities and
sessions with an unknown partner fall back to the plain label; the afterglow
(`socialized` → found-a-friend) and pending `social-invite` stay generic
because they have no live SocialSessionMember.

**Scoped out (follow-up B9a)** — the floating **pet-window capsule**
(`presentPetStatus`) still shows the bare "Chatting"/"Playing" label. Adding
the partner name there means threading `social` across the pet-window IPC
boundary (`PetWindowFrameSprite`) and widening `presentPetStatus`'s
signature — larger than this XS–S slice, deferred.

## B10. Group sessions (3+ participants)

**Problem** — Sessions are structurally two-party: `SocialSession` has fixed
`initiatorId`/`responderId` slots, each pet holds a single
`SocialSessionMember`, and `emitInvites` only pairs 1:1 while excluding pets
already in a session. Three pets can never share an interaction, and a third
pet near a chatting pair has no way in.

**Change**
- Schema: replace the two id slots with `participants: string[]` (two-party
  becomes the base case). Update `getSocialSnapshot`, tests, and any
  role-based logic (`role: "initiator" | "responder"` → initiator + joiners).
- Choreography generalization per kind:
  - chat: round-robin the speaking turn across N participants (turn logic
    already exists for 2).
  - chase: tag — one chaser, N runners; catching a runner makes them the
    chaser (pairs well with B5's catch moment).
  - greet: stand in a loose circle (positions on a small ring around the
    group centroid).
- Join flow: a `CanSocialize` pet that wanders within join radius of a live
  session may receive a *join invite* (session-scoped, not pet-scoped),
  accepted with the same personality/drive weighting. Cap group size
  (suggest 4) and gate joins to the play phase.
- Teardown: a participant being claimed away (user drag, agent event) removes
  just that member; the session survives while ≥2 remain.

**Acceptance**
- Seeded test: three idle agreeable pets end up in one chat session via a
  join, with the speech turn rotating over all three.
- Seeded test: removing one participant from a 3-pet session keeps the
  session alive for the remaining pair; dropping to 1 tears it down.
- Existing two-party tests keep passing (pairs are the degenerate case).

**Risk** — Choreography geometry (circle spacing vs collision overlap) will
fight the collision system unless B1–B3 have landed; sequence strictly after
B4.

Size: M–L. Depends on: B1–B4 (hard), B5 (chase-tag synergy, soft).
