import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { utteranceChannel } from "@pets-driven/pet-engine/features/agent/components";
import type {
  PersonalityComponent,
  PetExpressionEmote,
  PetExpressionMood,
} from "@pets-driven/pet-engine/features/behavior/components";
import {
  BEHAVIOR_PRIORITY,
  BOOKKEEPING_AUTONOMOUS_REASONS,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import { clampDrive } from "@pets-driven/pet-engine/features/drives/systems";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import { PET_SPEECH_KEY_PREFIX } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import type { SocialSessionComponent, SocialSessionKind } from "./components";
import { danceStepOffsets, isDanceFlourish } from "./dance";
import { acceptChance, bumpInviteChance, initiateScore, pickKind } from "./social-scores";

export { socialSessionKindWeights } from "./social-scores";

type Bounds = { x?: number; y?: number; width: number; height: number };
type Vec = { x: number; y: number };

// ── Tuning ─────────────────────────────────────────────────────────────────

const DEFAULT_BODY_WIDTH = 32;
// Two idle pets closer than this may strike up a session (well inside the 400px
// perception range so they have actually drifted near each other, not merely
// noticed one another across the screen).
const INVITE_RADIUS = 220;
// An unanswered invite is dropped after this long — a couple of ticks is plenty
// since the responder decides on the very next SocialInteractionSystem pass.
const INVITE_TTL_MS = 1_200;
// Per-ms base chance an eligible lonely extravert opens an invite; scaled by the
// initiation score and the frame's deltaMs so tick rate doesn't change the feel.
// Sessions now run tens of seconds, so invites are correspondingly rarer.
const INITIATE_RATE_PER_MS = 1 / 3_000;
// Re-claim lifetime while a session is live (refreshed every tick).
const SOCIAL_CLAIM_TTL_MS = 250;
// A finished session leaves this afterglow claim so the pet lingers, content,
// for a real moment instead of snapping straight back into wandering.
export const SESSION_AFTERGLOW_MS = 4_000;
// Reaching the end of a shared session is the biggest single relief of the
// social drive — larger than a fleeting friendly collision (0.15).
const SESSION_SOCIAL_REFILL = 0.55;
const DECLINE_SOCIAL_RELIEF = 0.08;

// Group sessions: a live session can grow up to this many participants as
// nearby idle pets join. Two is the base case, four keeps a group readable.
export const MAX_GROUP_SIZE = 4;
// A pet within this distance of a live session's centre may join it. Tighter
// than INVITE_RADIUS — you slip into a nearby huddle, you don't cross the room.
const JOIN_RADIUS = 160;

// The greet phase is arrival-driven: pets saunter toward each other and play
// begins when they actually meet (or this timeout fires, e.g. one pet gets
// physically stuck on the way).
export const GREET_TIMEOUT_MS = 5_000;

// play/part lengths per kind (ms). `play` is the payload; `part` is a short
// wind-down before teardown. These run on the tens-of-seconds scale — a chat
// is a real conversation to watch, not a blink.
export const PHASE_DURATIONS: Record<SocialSessionKind, { play: number; part: number }> = {
  greet: { play: 2_500, part: 800 },
  chat: { play: 9_000, part: 800 },
  chase: { play: 7_500, part: 800 },
  dance: { play: 7_700, part: 800 },
};

export const CHAT_TURN_MS = 2_000; // whose speech bubble shows, alternating
export const CHASE_SWAP_MS = 1_800; // how often chaser and runner trade roles
// A catch: chaser center within this many runner-body-widths triggers an
// immediate role swap and a "tag!" cue.
const CHASE_CATCH_BODY_WIDTHS = 1.2;
// After a catch cue, ignore further catches this long so a lingering overlap
// during the swap-around doesn't machine-gun the cue.
const CHASE_CATCH_COOLDOWN_MS = 700;

// Gait: walking up to a friend is a saunter; a chase is a romp at full tilt.
const APPROACH_SPEED_FACTOR = 0.45;
const CHASE_SPEED_FACTOR = 1.15;
const DANCE_SPEED_FACTOR = 1.15;

// Standing together during play: if any two participants are horizontally
// closer than MIN_PLAY_SPACING (body widths) the group is "stacked" and gets
// spread into an evenly spaced row at STAND_SPACING between neighbours.
const MIN_PLAY_SPACING_BW = 1.2;
const STAND_SPACING_BW = 1.5;

// Spoken lines live in the desktop i18n bundle under `petSpeech.social.<slot>`
// (see packages/i18n), same scheme as the personality voice profiles: this
// module only picks a variant index and builds the localizable key; the
// render layer resolves it via PET_SPEECH_KEY_PREFIX.
const SOCIAL_SPEECH_KEY_PREFIX = `${PET_SPEECH_KEY_PREFIX}.social`;

// Said by the pet that just tagged its friend.
const CHASE_CATCH_LINE_COUNT = 8;
const GREET_LINE_COUNT = 8;
const CHAT_LINE_COUNT = 20;

// ── Small helpers ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Upper bound on a session's lifetime, set at creation and tightened at play start. */
function maxSessionDurationMs(kind: SocialSessionKind): number {
  const d = PHASE_DURATIONS[kind];
  return GREET_TIMEOUT_MS + d.play + d.part;
}

/** The pets have met (or given up approaching): play begins now. */
function beginPlay(session: SocialSessionComponent, now: number): void {
  const d = PHASE_DURATIONS[session.kind];
  session.phase = "play";
  session.playStartedAt = now;
  session.endsAt = now + d.play + d.part;
}

/** Advance play → part once the play window has elapsed. */
function advancePlayPhase(session: SocialSessionComponent, now: number): void {
  if (session.phase !== "play") return;
  const playStartedAt = session.playStartedAt ?? session.startedAt;
  if (now - playStartedAt >= PHASE_DURATIONS[session.kind].play) {
    session.phase = "part";
  }
}

function bodyWidth(components: ComponentStore, id: string): number {
  return components.getComponent(id, "PhysicsBody")?.width ?? DEFAULT_BODY_WIDTH;
}

function positionOf(components: ComponentStore, id: string): Vec | null {
  return components.getComponent(id, "Transform")?.position ?? null;
}

/** A claim from a source that outranks `social` and is still live blocks us. */
function isBlockedByHigherPriority(components: ComponentStore, id: string, now: number): boolean {
  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (decision && decision.expiresAt > now) {
    if (BEHAVIOR_PRIORITY[decision.source] < BEHAVIOR_PRIORITY.social) {
      return true;
    }
  }
  return !!components.getComponent(id, "TaskMovementHold");
}

/**
 * Write (or refresh) a social claim, carrying forward the most recent
 * autonomous decision so BehaviorDecisionSystem's repeat-cooldowns survive the
 * session — mirrors the carry-forward in features/behavior/systems.ts `claim`.
 */
function claimSocial(
  components: ComponentStore,
  id: string,
  now: number,
  reason: string,
  expiresAt: number,
): void {
  const existing = components.getComponent(id, "BehaviorDecisionState");
  // Look through bookkeeping claims (arrival dwell, idle speech) at the last
  // genuine autonomous decision, mirroring features/behavior/systems.ts.
  const existingIsRealAutonomous =
    existing?.source === "autonomous" && !BOOKKEEPING_AUTONOMOUS_REASONS.has(existing.reason);
  const lastAutonomousReason = existingIsRealAutonomous
    ? existing.reason
    : (existing?.lastAutonomousReason ?? null);
  const lastAutonomousAt = existingIsRealAutonomous
    ? existing.decidedAt
    : (existing?.lastAutonomousAt ?? null);
  components.setComponent(id, {
    type: "BehaviorDecisionState",
    source: "social",
    decidedAt: now,
    expiresAt,
    reason,
    lastAutonomousReason,
    lastAutonomousAt,
  });
}

/** Let the current social claim lapse now so lower priorities can take over. */
function releaseSocialClaim(components: ComponentStore, id: string, now: number): void {
  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (decision?.source === "social") decision.expiresAt = now;
}

function setExpression(
  components: ComponentStore,
  id: string,
  mood: PetExpressionMood,
  emote: PetExpressionEmote,
  now: number,
  durationMs: number,
): void {
  components.setComponent(id, {
    type: "PetExpressionState",
    source: "social",
    mood,
    emote,
    label: null,
    startedAt: now,
    expiresAt: now + durationMs,
  });
}

// How long a spoken line lingers before SpeechExpirationSystem clears it. The
// default suits a one-shot cue (a chase "Tag!"); greet/chat pass a longer hold
// so the line stays up for its whole beat instead of blinking out early.
const SPEECH_LINGER_MS = 3_000;

function setSpeech(
  components: ComponentStore,
  id: string,
  line: string | null,
  now: number,
  durationMs = SPEECH_LINGER_MS,
): void {
  if (!line) {
    // Clearing our own social line: drop the channel so no empty shell lingers,
    // unless an agent status currently owns it (never clobber "working").
    const existing = components.getComponent(id, "AgentChannelState");
    if (!existing || existing.status == null) {
      components.removeComponent(id, "AgentChannelState");
    }
    return;
  }
  components.setComponent(
    id,
    utteranceChannel({ message: line, source: "social", now, durationMs }),
  );
}

function stop(components: ComponentStore, id: string): void {
  components.setComponent(id, {
    type: "MotionTarget",
    targetEntityId: null,
    targetPosition: null,
  });
  components.setComponent(id, { type: "Steering", mode: "stand" });
}

function moveToward(
  components: ComponentStore,
  id: string,
  target: Vec,
  speedFactor?: number,
): void {
  components.setComponent(id, {
    type: "MotionTarget",
    targetEntityId: null,
    targetPosition: target,
    speedFactor,
  });
  components.setComponent(id, { type: "Steering", mode: "pursue" });
}

/** A point on the P→Q line stopping `gap` short of Q (or P if already close). */
function approachStop(p: Vec, q: Vec, gap: number): Vec {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= gap) return { x: p.x, y: p.y };
  const t = (d - gap) / d;
  return { x: p.x + dx * t, y: p.y + dy * t };
}

function fleeTarget(self: Vec, from: Vec, distance: number, bounds: Bounds): Vec {
  const dx = self.x - from.x;
  const dy = self.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const margin = 48;
  return {
    x: clamp(
      self.x + (dx / len) * distance,
      (bounds.x ?? 0) + margin,
      (bounds.x ?? 0) + bounds.width - margin,
    ),
    y: clamp(
      self.y + (dy / len) * distance,
      (bounds.y ?? 0) + margin,
      (bounds.y ?? 0) + bounds.height - margin,
    ),
  };
}

/** Arithmetic centre of a set of points. */
function centroidOf(points: Vec[]): Vec {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** The largest distance between any two of the points (group "spread"). */
function maxPairwiseDistance(points: Vec[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      max = Math.max(max, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    }
  }
  return max;
}

/**
 * Stand a playing group together without overlapping. Pets are floor-bound
 * ghosts, so spacing is purely horizontal: if the tightest pair is closer than
 * MIN_PLAY_SPACING the group is stacked, and everyone saunters to an evenly
 * spaced row (keeping left-to-right order so nobody crosses through a friend);
 * otherwise they just stop where they are.
 */
function standSpaced(components: ComponentStore, ids: string[], pos: Vec[], bounds: Bounds): void {
  if (ids.length < 2) {
    for (const id of ids) stop(components, id);
    return;
  }
  const bw = bodyWidth(components, ids[0]);

  let minGap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pos.length; i += 1) {
    for (let j = i + 1; j < pos.length; j += 1) {
      minGap = Math.min(minGap, Math.abs(pos[i].x - pos[j].x));
    }
  }
  if (minGap >= bw * MIN_PLAY_SPACING_BW) {
    for (const id of ids) stop(components, id);
    return;
  }

  const centreX = pos.reduce((sum, p) => sum + p.x, 0) / pos.length;
  const spacing = bw * STAND_SPACING_BW;
  const margin = 48;
  const minX = (bounds.x ?? 0) + margin;
  const maxX = (bounds.x ?? 0) + bounds.width - margin;
  // Left-to-right order so the row assignment never asks two pets to swap sides.
  const order = ids
    .map((id, index) => ({ id, index }))
    .sort((l, r) => pos[l.index].x - pos[r.index].x);
  order.forEach(({ id, index }, rank) => {
    const targetX = clamp(centreX + (rank - (order.length - 1) / 2) * spacing, minX, maxX);
    moveToward(components, id, { x: targetX, y: pos[index].y }, APPROACH_SPEED_FACTOR);
  });
}

/** The point nearest to `fromIndex` among the others (there is always one). */
function nearestOther(points: Vec[], fromIndex: number): { index: number; distance: number } {
  let index = -1;
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    if (i === fromIndex) continue;
    const d = Math.hypot(points[i].x - points[fromIndex].x, points[i].y - points[fromIndex].y);
    if (d < distance) {
      distance = d;
      index = i;
    }
  }
  return { index, distance };
}

/** Build a localizable `petSpeech.social.<slot>.<variant>` key, seeded like the old literal-line pick. */
function pickLine(slot: string, variantCount: number, seed: number): string {
  return `${SOCIAL_SPEECH_KEY_PREFIX}.${slot}.${Math.abs(Math.floor(seed)) % variantCount}`;
}

// ── The system ───────────────────────────────────────────────────────────────

export function runSocialInteractionSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: Bounds,
  deltaMs: number,
): void {
  const now = clock.now();

  advanceSessions(components, now, bounds);
  resolveInvites(components, now, random);
  convertBumpsToInvites(components, now, random);
  emitJoins(components, now, random);
  emitInvites(components, now, random, deltaMs);
}

// Pass 1 — advance live sessions: prune members who left or got claimed away,
// tear the session down when it runs out or drops below two, else choreograph.
function advanceSessions(components: ComponentStore, now: number, bounds: Bounds): void {
  const sessionIds = [...components.components("SocialSession").keys()];
  for (const sessionId of sessionIds) {
    const session = components.getComponent(sessionId, "SocialSession");
    if (!session) continue;

    // Who is still genuinely in the session: their SocialSessionMember still
    // points here and nothing more urgent has grabbed them.
    const remaining = session.participantIds.filter(
      (id) =>
        components.getComponent(id, "SocialSessionMember")?.sessionId === sessionId &&
        !isBlockedByHigherPriority(components, id, now),
    );

    // A group survives a drop-out; a pair does not (nobody left to play with).
    if (remaining.length < 2 || now >= session.endsAt) {
      endSession(components, sessionId, session, now);
      continue;
    }

    if (remaining.length !== session.participantIds.length) {
      for (const id of session.participantIds) {
        if (!remaining.includes(id)) partWithParticipant(components, sessionId, id, now);
      }
      session.participantIds = remaining;
      session.danceCentreX = null;
      if (session.chaserId && !remaining.includes(session.chaserId)) {
        session.chaserId = remaining[0];
      }
      refreshPartnerIds(components, session);
    }

    choreograph(components, session, now, bounds);
  }
}

function choreograph(
  components: ComponentStore,
  session: SocialSessionComponent,
  now: number,
  bounds: Bounds,
): void {
  const ids = session.participantIds;
  const positions = ids.map((id) => positionOf(components, id));
  if (positions.some((p) => !p)) return;
  const pos = positions as Vec[];

  const claimTtl = now + SOCIAL_CLAIM_TTL_MS;
  for (const id of ids) {
    claimSocial(components, id, now, `session-${session.kind}`, claimTtl);
  }

  if (session.kind === "chase") {
    choreographChase(components, session, pos, now, bounds);
    return;
  }

  // Greet, chat, and dance share the "gather, then stand together" shape. The greet
  // phase is arrival-driven: everyone saunters toward the group's centre and
  // play begins when they have all bunched up (or the greet timeout fires).
  const spacingByKind: Record<Exclude<SocialSessionKind, "chase">, number> = {
    greet: 2,
    chat: 2.6,
    dance: 2.2,
  };
  const gap = bodyWidth(components, ids[0]) * spacingByKind[session.kind];
  const centre = centroidOf(pos);
  if (session.phase === "approach") {
    const met = maxPairwiseDistance(pos) <= gap * 1.35;
    const timedOut = now - session.startedAt >= GREET_TIMEOUT_MS;
    if (!met && !timedOut) {
      ids.forEach((id, i) => {
        moveToward(components, id, approachStop(pos[i], centre, gap), APPROACH_SPEED_FACTOR);
      });
      return;
    }
    beginPlay(session, now);
  }
  advancePlayPhase(session, now);

  // play / part — stand together, but not on top of each other. Pets are
  // physical ghosts (they pass through), so standing still where they met can
  // leave them stacked; nudge a too-close huddle into an evenly-spaced row.
  if (session.kind === "dance") {
    choreographDance(components, session, pos, now, bounds);
    return;
  }

  standSpaced(components, ids, pos, bounds);

  if (session.kind === "greet") {
    if (!session.greeted) {
      // The greeting is spoken once (not refreshed per tick), so hold it for
      // the whole greet play beat rather than letting it vanish after a blink.
      ids.forEach((id, i) => {
        setSpeech(
          components,
          id,
          pickLine("greet", GREET_LINE_COUNT, session.startedAt + i),
          now,
          PHASE_DURATIONS.greet.play,
        );
      });
      session.greeted = true;
    }
    const emote = session.phase === "part" ? "sparkle" : "heart";
    for (const id of ids) setExpression(components, id, "love", emote, now, 400);
    return;
  }

  // chat — one speaker at a time, the turn rotating round-robin over everyone.
  if (session.phase === "part") {
    for (const id of ids) {
      setSpeech(components, id, null, now);
      setExpression(components, id, "happy", "sparkle", now, 400);
    }
    return;
  }
  const playElapsed = now - (session.playStartedAt ?? session.startedAt);
  const turn = Math.floor(playElapsed / CHAT_TURN_MS);
  const speakerIndex = ((turn % ids.length) + ids.length) % ids.length;
  ids.forEach((id, i) => {
    if (i === speakerIndex) {
      // Refreshed every tick of the turn, but give it the turn's length so the
      // bubble never blinks out between refreshes or at the turn boundary.
      setSpeech(
        components,
        id,
        pickLine("chat", CHAT_LINE_COUNT, session.startedAt + turn),
        now,
        CHAT_TURN_MS,
      );
      setExpression(components, id, "thinking", "none", now, 400);
    } else {
      setSpeech(components, id, null, now);
      setExpression(components, id, "thinking", "question", now, 400);
    }
  });
}

function choreographDance(
  components: ComponentStore,
  session: SocialSessionComponent,
  pos: Vec[],
  now: number,
  bounds: Bounds,
): void {
  const ids = session.participantIds;
  for (const id of ids) setSpeech(components, id, null, now);

  if (session.phase === "part") {
    for (const id of ids) {
      stop(components, id);
      setExpression(components, id, "happy", "sparkle", now, 400);
    }
    return;
  }

  const elapsed = now - (session.playStartedAt ?? session.startedAt);
  const order = ids
    .map((id, index) => ({ id, index }))
    .sort((left, right) => pos[left.index].x - pos[right.index].x);
  const centreX = session.danceCentreX ?? centroidOf(pos).x;
  session.danceCentreX = centreX;

  const bw = Math.max(...order.map(({ id }) => bodyWidth(components, id)));
  const spacing = bw * (ids.length === 2 ? 4 : 2.5);
  const offsets = danceStepOffsets(ids.length, elapsed);
  const margin = 48;
  const minX = (bounds.x ?? 0) + margin;
  const maxX = (bounds.x ?? 0) + bounds.width - margin;
  const flourish = isDanceFlourish(elapsed);

  order.forEach(({ id, index }, rank) => {
    const baseX = centreX + (rank - (order.length - 1) / 2) * spacing;
    const targetX = clamp(baseX + (offsets[rank] ?? 0) * bw, minX, maxX);
    if (flourish || Math.abs(pos[index].x - targetX) <= 2) {
      stop(components, id);
    } else {
      moveToward(components, id, { x: targetX, y: pos[index].y }, DANCE_SPEED_FACTOR);
    }
    setExpression(
      components,
      id,
      "excited",
      flourish ? "sparkle" : offsets[rank] === 0 ? "note" : "none",
      now,
      400,
    );
  });
}

function choreographChase(
  components: ComponentStore,
  session: SocialSessionComponent,
  pos: Vec[],
  now: number,
  bounds: Bounds,
): void {
  const ids = session.participantIds;

  // A chase needs no approach ritual — it kicks off the moment everyone joins.
  if (session.phase === "approach") beginPlay(session, now);
  advancePlayPhase(session, now);
  // One chaser, everyone else runs. The initiator chases first; fall back to the
  // first participant when the stored chaser is missing or has left the session.
  const chaserId =
    session.chaserId != null && ids.includes(session.chaserId) ? session.chaserId : ids[0];
  session.chaserId = chaserId;

  if (session.phase === "part") {
    for (const id of ids) {
      stop(components, id);
      setExpression(components, id, "happy", "sparkle", now, 400);
    }
    return;
  }

  // Detect a catch against the chaser's nearest runner.
  const chaserIndex = ids.indexOf(chaserId);
  const nearestRunner = nearestOther(pos, chaserIndex);
  const cueCooledDown =
    now - (session.lastCatchAt ?? Number.NEGATIVE_INFINITY) >= CHASE_CATCH_COOLDOWN_MS;
  const catchRadius = bodyWidth(components, ids[nearestRunner.index]) * CHASE_CATCH_BODY_WIDTHS;
  const caught = nearestRunner.distance <= catchRadius && cueCooledDown;

  const swapReference = session.lastChaseSwapAt ?? session.playStartedAt ?? session.startedAt;

  // The active chaser may change this tick (a catch or a timed swap).
  let activeChaserId = chaserId;
  if (caught) {
    const caughtId = ids[nearestRunner.index];
    // The chaser tags a runner: a quick excited cue, spoken by the catcher.
    setSpeech(components, chaserId, pickLine("chaseCatch", CHASE_CATCH_LINE_COUNT, now), now);
    setExpression(components, chaserId, "excited", "sparkle", now, 600);
    setExpression(components, caughtId, "confused", "exclaim", now, 600);
    session.lastCatchAt = now;
    // The caught runner becomes the new chaser (tag!).
    session.chaserId = caughtId;
    activeChaserId = caughtId;
    session.chaseSwaps = (session.chaseSwaps ?? 0) + 1;
    session.lastChaseSwapAt = now;
  } else if (now - swapReference >= CHASE_SWAP_MS) {
    // Timer swap: hand the role round-robin to the next participant.
    const nextChaserId = ids[(chaserIndex + 1) % ids.length];
    session.chaserId = nextChaserId;
    activeChaserId = nextChaserId;
    session.chaseSwaps = (session.chaseSwaps ?? 0) + 1;
    session.lastChaseSwapAt = now;
  }

  // Movement uses the (possibly updated) chaser: it pursues its nearest runner
  // and everyone else flees from it.
  const activeChaserIndex = ids.indexOf(activeChaserId);
  const activeChaserPos = pos[activeChaserIndex];
  const target = nearestOther(pos, activeChaserIndex);
  moveToward(components, activeChaserId, { ...pos[target.index] }, CHASE_SPEED_FACTOR);
  ids.forEach((id, i) => {
    if (i === activeChaserIndex) return;
    const fleeDistance = bodyWidth(components, id) * 6;
    moveToward(
      components,
      id,
      fleeTarget(pos[i], activeChaserPos, fleeDistance, bounds),
      CHASE_SPEED_FACTOR,
    );
  });
  // The catch cue owns the expressions this tick; otherwise everyone just
  // looks excited (the chaser with a sparkle).
  if (!caught) {
    ids.forEach((id, i) => {
      setExpression(
        components,
        id,
        "excited",
        i === activeChaserIndex ? "sparkle" : "none",
        now,
        400,
      );
    });
  }
}

function endSession(
  components: ComponentStore,
  sessionId: string,
  session: SocialSessionComponent,
  now: number,
): void {
  for (const id of session.participantIds) {
    partWithParticipant(components, sessionId, id, now);
  }
  components.destroy(sessionId);
}

/**
 * Release one pet from a session — used both when the whole session ends and
 * when a single participant drops out of a surviving group. Removes the member
 * link, refills its social drive, and (unless something more urgent already
 * owns it) stops it into a brief content afterglow.
 */
function partWithParticipant(
  components: ComponentStore,
  sessionId: string,
  id: string,
  now: number,
): void {
  if (components.getComponent(id, "SocialSessionMember")?.sessionId === sessionId) {
    components.removeComponent(id, "SocialSessionMember");
  }
  refillSocial(components, id, SESSION_SOCIAL_REFILL);
  recordPetExperience(components, id, "socialized", now);
  // A pet the session lost to a higher-priority claim is owned by that claim;
  // don't stop it or hold an afterglow over the top of it.
  if (!isBlockedByHigherPriority(components, id, now)) {
    stop(components, id);
    claimSocial(components, id, now, "socialized", now + SESSION_AFTERGLOW_MS);
    setExpression(components, id, "happy", "sparkle", now, 500);
  }
}

/** Point each member's representative partnerId at a current co-participant. */
function refreshPartnerIds(components: ComponentStore, session: SocialSessionComponent): void {
  for (const id of session.participantIds) {
    const member = components.getComponent(id, "SocialSessionMember");
    if (member?.sessionId) {
      member.partnerId = session.participantIds.find((p) => p !== id) ?? id;
    }
  }
}

// Pass 2 — accept or decline every pending invite.
function resolveInvites(components: ComponentStore, now: number, random: RandomSource): void {
  const targetIds = [...components.components("SocialInvite").keys()];
  for (const targetId of targetIds) {
    const invite = components.getComponent(targetId, "SocialInvite");
    if (!invite) continue;
    const fromId = invite.fromId;

    // A pet frozen in collision deliberation (PendingReaction) is not ready:
    // collision no longer outranks social, so without this check a session
    // could form mid-freeze and leave the stale reaction to fire much later.
    const initiatorReady =
      !components.getComponent(fromId, "SocialSessionMember") &&
      !components.getComponent(fromId, "PendingReaction") &&
      !isBlockedByHigherPriority(components, fromId, now);
    const targetReady =
      !components.getComponent(targetId, "SocialSessionMember") &&
      !components.getComponent(targetId, "PendingReaction") &&
      !isBlockedByHigherPriority(components, targetId, now);

    if (now >= invite.expiresAt || !initiatorReady || !targetReady) {
      components.removeComponent(targetId, "SocialInvite");
      releaseSocialClaim(components, fromId, now);
      continue;
    }

    const personality = components.getComponent(targetId, "Personality");
    const drives = components.getComponent(targetId, "Drives");
    const accepts = !!personality && random.next() < acceptChance(personality, drives);

    if (accepts) {
      createSession(components, [fromId, targetId], invite.kind, now);
    } else {
      // A decline is content too: the target shrugs it off, the initiator's
      // hold lapses so it wanders on.
      setExpression(components, targetId, "confused", "exclaim", now, 500);
      refillSocial(components, targetId, DECLINE_SOCIAL_RELIEF);
      releaseSocialClaim(components, fromId, now);
    }
    components.removeComponent(targetId, "SocialInvite");
  }
}

function createSession(
  components: ComponentStore,
  participantIds: string[],
  kind: SocialSessionKind,
  now: number,
): void {
  const sessionId = `social-${participantIds.join("-")}-${now}`;
  components.spawn(sessionId, [
    {
      type: "SocialSession",
      kind,
      participantIds: [...participantIds],
      phase: "approach",
      startedAt: now,
      endsAt: now + maxSessionDurationMs(kind),
      playStartedAt: null,
      greeted: false,
      chaserId: null,
      chaseSwaps: 0,
      lastChaseSwapAt: null,
      lastCatchAt: null,
    },
  ]);
  const ttl = now + SOCIAL_CLAIM_TTL_MS;
  participantIds.forEach((id, index) => {
    setSessionMember(components, sessionId, participantIds, id, index);
    claimSocial(components, id, now, `session-${kind}`, ttl);
    // The session absorbs any startle that was still pending — a stale
    // PendingReaction must not fire a collision response after the party.
    components.removeComponent(id, "PendingReaction");
  });
}

/** Write the back-reference for one participant (index 0 = initiator). */
function setSessionMember(
  components: ComponentStore,
  sessionId: string,
  participantIds: string[],
  id: string,
  index: number,
): void {
  components.setComponent(id, {
    type: "SocialSessionMember",
    sessionId,
    partnerId: participantIds.find((p) => p !== id) ?? id,
    role: index === 0 ? "initiator" : "responder",
  });
}

// ── Bump-to-greet (B4) ───────────────────────────────────────────────────────
//
// A collision between two socializable pets is a social event, not a hazard.
// When a pet's collision deliberation (PendingReaction) matures, this pass
// runs BEFORE BehaviorDecisionSystem gets to sample the reactive pool: a
// personality-weighted roll may convert the bump into a SocialInvite instead.
// The friendly turn also defuses the partner's own pending startle, so a
// mutual bump produces one invite, not two crossing reactions. Shy pets
// (high N, low A) roll near zero and keep their flee/avoid instincts.

// Bump invites skew toward a greet — you say hi to someone you walked into —
// with the remainder falling through to the personality-weighted pickKind.
const BUMP_GREET_BIAS = 0.6;

/**
 * Both halves of a bump must be free social agents for the conversion to be
 * on the table. Exported for BehaviorDecisionSystem, which drops the
 * collision-engage candidate for eligible pairs — the invite path supersedes
 * it (engage remains the fallback toward non-socializable entities).
 */
export function isBumpSocialEligible(
  components: ComponentStore,
  id: string,
  otherId: string,
  now: number,
): boolean {
  for (const participant of [id, otherId]) {
    if (!components.getComponent(participant, "CanSocialize")) return false;
    if (!components.getComponent(participant, "Personality")) return false;
    if (components.getComponent(participant, "SocialSessionMember")) {
      return false;
    }
    if (components.getComponent(participant, "TaskMovementHold")) return false;
    if (components.getComponent(participant, "AgentTaskState")?.status === "working") {
      return false;
    }
    if (isBlockedByHigherPriority(components, participant, now)) return false;
  }
  return true;
}

function convertBumpsToInvites(
  components: ComponentStore,
  now: number,
  random: RandomSource,
): void {
  type Bump = {
    id: string;
    otherId: string;
    personality: PersonalityComponent;
  };
  const bumps: Bump[] = [];
  components.forEach(
    ["PendingReaction", "CanSocialize", "Personality"],
    (id, [reaction, , personality]) => {
      if (reaction.source !== "collision") return;
      // Preserve the startle beat: the pet stays visibly frozen until its
      // deliberation matures, then turns friendly (or reacts) in one motion.
      if (now < reaction.reactsAt) return;
      const otherId = reaction.context.otherEntityId;
      if (!otherId) return;
      if (components.getComponent(id, "SocialInvite")) return;
      if (components.getComponent(otherId, "SocialInvite")) return;
      if (!isBumpSocialEligible(components, id, otherId, now)) return;
      bumps.push({ id, otherId, personality });
    },
  );
  if (bumps.length === 0) return;

  // Deterministic order; the first converter consumes both sides of the pair.
  bumps.sort((l, r) => (l.id < r.id ? -1 : l.id > r.id ? 1 : 0));
  const consumed = new Set<string>();

  for (const bump of bumps) {
    if (consumed.has(bump.id) || consumed.has(bump.otherId)) continue;
    // A failed roll leaves the PendingReaction in place: the pet declined the
    // friendly option, and BehaviorDecisionSystem consumes the reaction with
    // the normal (engage-less) reactive pool later this same tick.
    if (
      random.next() >=
      bumpInviteChance(bump.personality, components.getComponent(bump.id, "Drives"))
    ) {
      continue;
    }

    const otherPersonality = components.getComponent(bump.otherId, "Personality");
    const kind: SocialSessionKind =
      random.next() < BUMP_GREET_BIAS || !otherPersonality
        ? "greet"
        : pickKind(bump.personality, otherPersonality, random);

    components.setComponent(bump.otherId, {
      type: "SocialInvite",
      fromId: bump.id,
      kind,
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });
    claimSocial(components, bump.id, now, "social-invite", now + INVITE_TTL_MS);
    stop(components, bump.id);
    setExpression(components, bump.id, "happy", "heart", now, 500);
    components.removeComponent(bump.id, "PendingReaction");
    // The friendly turn defuses the partner's own startle about this bump.
    const otherReaction = components.getComponent(bump.otherId, "PendingReaction");
    if (otherReaction?.context.otherEntityId === bump.id) {
      components.removeComponent(bump.otherId, "PendingReaction");
    }
    consumed.add(bump.id);
    consumed.add(bump.otherId);
  }
}

// Pass 2b — a nearby idle pet may slip into a live session that has room.
// Joining is session-scoped (no pet-to-pet handshake): the huddle is open, so
// an eligible pet close to its centre and willing (personality/drive-weighted)
// simply joins. Gated to the play phase and capped at MAX_GROUP_SIZE.
function emitJoins(components: ComponentStore, now: number, random: RandomSource): void {
  const sessionIds = [...components.components("SocialSession").keys()];
  for (const sessionId of sessionIds) {
    const session = components.getComponent(sessionId, "SocialSession");
    if (!session) continue;
    if (session.phase !== "play") continue;
    if (session.participantIds.length >= MAX_GROUP_SIZE) continue;

    const positions = session.participantIds
      .map((id) => positionOf(components, id))
      .filter((p): p is Vec => p !== null);
    if (positions.length === 0) continue;
    const centre = centroidOf(positions);

    type Candidate = {
      id: string;
      dist: number;
      personality: PersonalityComponent;
      drives: DrivesComponent | undefined;
    };
    const candidates: Candidate[] = [];
    components.forEach(
      ["CanSocialize", "Personality", "Steering", "MotionTarget", "Transform", "ContactState"],
      (id, [, personality, intent, motion, transform, contact]) => {
        if (session.participantIds.includes(id)) return;
        if (intent.mode !== "stand") return;
        if (motion.targetPosition !== null || motion.targetEntityId !== null) return;
        if (!contact.grounded) return;
        if (components.getComponent(id, "SocialSessionMember")) return;
        if (components.getComponent(id, "SocialInvite")) return;
        if (components.getComponent(id, "PendingReaction")) return;
        if (isBlockedByHigherPriority(components, id, now)) return;
        const decision = components.getComponent(id, "BehaviorDecisionState");
        if (decision?.source === "social" && decision.expiresAt > now) return;
        if (components.getComponent(id, "AgentTaskState")?.status === "working") return;
        const dist = Math.hypot(transform.position.x - centre.x, transform.position.y - centre.y);
        if (dist >= JOIN_RADIUS) return;
        candidates.push({ id, dist, personality, drives: components.getComponent(id, "Drives") });
      },
    );
    if (candidates.length === 0) continue;

    // Nearest eligible pet, deterministic tie-break; one join roll per tick.
    candidates.sort((l, r) => l.dist - r.dist || (l.id < r.id ? -1 : 1));
    const joiner = candidates[0];
    if (random.next() >= acceptChance(joiner.personality, joiner.drives)) continue;

    session.participantIds = [...session.participantIds, joiner.id];
    session.danceCentreX = null;
    setSessionMember(
      components,
      sessionId,
      session.participantIds,
      joiner.id,
      session.participantIds.length - 1,
    );
    claimSocial(components, joiner.id, now, `session-${session.kind}`, now + SOCIAL_CLAIM_TTL_MS);
    components.removeComponent(joiner.id, "PendingReaction");
    refreshPartnerIds(components, session);
    stop(components, joiner.id);
  }
}

// Pass 3 — idle, eligible pets may open an invite to a nearby idle partner.
function emitInvites(
  components: ComponentStore,
  now: number,
  random: RandomSource,
  deltaMs: number,
): void {
  type Candidate = {
    id: string;
    pos: Vec;
    personality: PersonalityComponent;
    drives: DrivesComponent | undefined;
  };
  const candidates: Candidate[] = [];
  components.forEach(
    ["CanSocialize", "Personality", "Steering", "MotionTarget", "Transform", "ContactState"],
    (id, [, personality, intent, motion, transform, contact]) => {
      if (intent.mode !== "stand") return;
      if (motion.targetPosition !== null || motion.targetEntityId !== null) return;
      if (!contact.grounded) return;
      if (components.getComponent(id, "SocialSessionMember")) return;
      if (components.getComponent(id, "SocialInvite")) return;
      // Mid-collision-deliberation pets look idle (frozen, target cleared)
      // but must finish reacting before they can strike up a conversation.
      if (components.getComponent(id, "PendingReaction")) return;
      if (isBlockedByHigherPriority(components, id, now)) return;
      // Skip pets already holding a live social claim: one that just finished a
      // session (its "socialized" afterglow) or is awaiting its own pending
      // invite. Without this, a pet re-invites in the very same tick it was
      // freed, overwriting the afterglow and never getting a beat to itself.
      const decision = components.getComponent(id, "BehaviorDecisionState");
      if (decision?.source === "social" && decision.expiresAt > now) return;
      const agentTask = components.getComponent(id, "AgentTaskState");
      if (agentTask?.status === "working") return;
      candidates.push({
        id,
        pos: { x: transform.position.x, y: transform.position.y },
        personality,
        drives: components.getComponent(id, "Drives"),
      });
    },
  );
  if (candidates.length < 2) return;

  // Deterministic order; only the smaller id in a pair may initiate so a pair
  // never exchanges two crossing invites in the same tick.
  candidates.sort((l, r) => (l.id < r.id ? -1 : l.id > r.id ? 1 : 0));
  const invitedThisTick = new Set<string>();

  for (const self of candidates) {
    if (invitedThisTick.has(self.id)) continue;

    let partner: Candidate | null = null;
    let bestDist = INVITE_RADIUS;
    for (const other of candidates) {
      if (other.id <= self.id) continue; // symmetry break
      if (invitedThisTick.has(other.id)) continue;
      const dist = Math.hypot(other.pos.x - self.pos.x, other.pos.y - self.pos.y);
      if (dist < bestDist) {
        bestDist = dist;
        partner = other;
      }
    }
    if (!partner) continue;

    const chance = initiateScore(self.personality, self.drives) * INITIATE_RATE_PER_MS * deltaMs;
    if (random.next() >= chance) continue;

    const kind = pickKind(self.personality, partner.personality, random);
    components.setComponent(partner.id, {
      type: "SocialInvite",
      fromId: self.id,
      kind,
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });
    claimSocial(components, self.id, now, "social-invite", now + INVITE_TTL_MS);
    stop(components, self.id); // hold still while awaiting the answer
    invitedThisTick.add(self.id);
    invitedThisTick.add(partner.id);
  }
}

function refillSocial(components: ComponentStore, id: string, amount: number): void {
  const drives = components.getComponent(id, "Drives");
  if (!drives) return;
  drives.social = clampDrive(drives.social - amount);
}
