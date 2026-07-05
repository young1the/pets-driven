import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import {
  ARRIVAL_DWELL_REASON,
  BEHAVIOR_PRIORITY,
} from "@pets-driven/pet-engine/features/behavior/components";
import { clampDrive, driveResponseCurve } from "@pets-driven/pet-engine/features/drives/systems";
import type {
  SocialSessionComponent,
  SocialSessionKind,
} from "./components";

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

// The greet phase is arrival-driven: pets saunter toward each other and play
// begins when they actually meet (or this timeout fires, e.g. one pet gets
// physically stuck on the way).
export const GREET_TIMEOUT_MS = 5_000;

// play/part lengths per kind (ms). `play` is the payload; `part` is a short
// wind-down before teardown. These run on the tens-of-seconds scale — a chat
// is a real conversation to watch, not a blink.
export const PHASE_DURATIONS: Record<
  SocialSessionKind,
  { play: number; part: number }
> = {
  greet: { play: 2_500, part: 800 },
  chat: { play: 16_000, part: 800 },
  chase: { play: 7_500, part: 800 },
};

export const CHAT_TURN_MS = 2_000; // whose speech bubble shows, alternating
export const CHASE_SWAP_MS = 1_800; // how often chaser and runner trade roles

// Gait: walking up to a friend is a saunter; a chase is a romp at full tilt.
const APPROACH_SPEED_FACTOR = 0.45;
const CHASE_SPEED_FACTOR = 1.15;

const GREET_LINES = ["Hi!", "Hey there!", "Oh, hello!", "There you are!"];
const CHAT_LINES = [
  "Guess what?",
  "No way…",
  "Really?",
  "Hehe.",
  "So then—",
  "Same!",
  "And then?",
  "You think so?",
  "Haha, right?",
  "Tell me more!",
];

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
function isBlockedByHigherPriority(
  components: ComponentStore,
  id: string,
  now: number,
): boolean {
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
  // Look through arrival-dwell rest beats at the last genuine autonomous
  // decision, mirroring the carry-forward in features/behavior/systems.ts.
  const existingIsRealAutonomous =
    existing?.source === "autonomous" &&
    existing.reason !== ARRIVAL_DWELL_REASON;
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
function releaseSocialClaim(
  components: ComponentStore,
  id: string,
  now: number,
): void {
  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (decision?.source === "social") decision.expiresAt = now;
}

function setExpression(
  components: ComponentStore,
  id: string,
  mood: "love" | "happy" | "excited" | "thinking" | "confused",
  emote: "none" | "heart" | "sparkle" | "question" | "exclaim",
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

function setSpeech(
  components: ComponentStore,
  id: string,
  line: string | null,
  now: number,
): void {
  components.setComponent(id, {
    type: "SpeechState",
    speech: line,
    expiresAt: line ? now + 1_500 : null,
  });
}

function stop(components: ComponentStore, id: string): void {
  components.setComponent(id, {
    type: "MotionTarget",
    targetEntityId: null,
    targetPosition: null,
  });
  components.setComponent(id, { type: "IntentState", intent: "idle" });
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
  components.setComponent(id, { type: "IntentState", intent: "active" });
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

// ── Personality/drive scoring ────────────────────────────────────────────────

function socialDrive(drives: DrivesComponent | undefined): number {
  return drives ? driveResponseCurve(drives.social) : 0;
}

/** Desire to open an invite this tick (before the deltaMs/rate scaling). */
function initiateScore(
  p: PersonalityComponent,
  drives: DrivesComponent | undefined,
): number {
  return clamp(
    0.15 +
      p.extraversion * 0.5 +
      p.agreeableness * 0.2 +
      socialDrive(drives) * 0.5 -
      p.neuroticism * 0.3,
    0,
    1,
  );
}

/** Probability the responder accepts an invite. */
function acceptChance(
  p: PersonalityComponent,
  drives: DrivesComponent | undefined,
): number {
  return clamp(
    0.3 +
      p.agreeableness * 0.5 +
      p.extraversion * 0.3 +
      socialDrive(drives) * 0.4 -
      p.neuroticism * 0.45,
    0.05,
    0.95,
  );
}

/**
 * Pick a session kind from the two personalities. Energetic/open pairs romp
 * (chase), warm calm pairs greet, talkative pairs chat. Weighted random keeps
 * it varied rather than deterministic.
 */
function pickKind(
  a: PersonalityComponent,
  b: PersonalityComponent,
  random: RandomSource,
): SocialSessionKind {
  const e = (a.extraversion + b.extraversion) / 2;
  const o = (a.openness + b.openness) / 2;
  const agr = (a.agreeableness + b.agreeableness) / 2;
  const n = (a.neuroticism + b.neuroticism) / 2;
  const weights: Array<{ kind: SocialSessionKind; w: number }> = [
    { kind: "chase", w: clamp(0.15 + e * 0.6 + o * 0.3 - n * 0.4, 0.02, 2) },
    { kind: "greet", w: clamp(0.3 + agr * 0.4 + (1 - n) * 0.2, 0.02, 2) },
    { kind: "chat", w: clamp(0.25 + e * 0.4 + agr * 0.3, 0.02, 2) },
  ];
  const total = weights.reduce((s, x) => s + x.w, 0);
  let r = random.next() * total;
  for (const entry of weights) {
    r -= entry.w;
    if (r <= 0) return entry.kind;
  }
  return "greet";
}

function pickLine(lines: string[], seed: number): string {
  return lines[Math.abs(Math.floor(seed)) % lines.length];
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
  emitInvites(components, now, random, deltaMs);
}

// Pass 1 — advance live sessions and tear down finished/interrupted ones.
function advanceSessions(components: ComponentStore, now: number, bounds: Bounds): void {
  const sessionIds = [...components.components("SocialSession").keys()];
  for (const sessionId of sessionIds) {
    const session = components.getComponent(sessionId, "SocialSession");
    if (!session) continue;
    const a = session.initiatorId;
    const b = session.responderId;

    const stillPaired =
      components.getComponent(a, "SocialSessionMember")?.sessionId === sessionId &&
      components.getComponent(b, "SocialSessionMember")?.sessionId === sessionId;
    const interrupted =
      isBlockedByHigherPriority(components, a, now) ||
      isBlockedByHigherPriority(components, b, now);

    if (!stillPaired || interrupted || now >= session.endsAt) {
      endSession(components, sessionId, session, now);
      continue;
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
  const a = session.initiatorId;
  const b = session.responderId;
  const posA = positionOf(components, a);
  const posB = positionOf(components, b);
  if (!posA || !posB) return;

  const claimTtl = now + SOCIAL_CLAIM_TTL_MS;
  claimSocial(components, a, now, `session-${session.kind}`, claimTtl);
  claimSocial(components, b, now, `session-${session.kind}`, claimTtl);

  if (session.kind === "chase") {
    choreographChase(components, session, posA, posB, now, bounds);
    return;
  }

  // greet & chat share the "close the gap, then face each other" shape.
  // The greet phase is arrival-driven: both pets saunter toward each other and
  // play begins when they actually meet, so the approach itself is visible.
  const gap = bodyWidth(components, a) * (session.kind === "chat" ? 2.6 : 2);
  if (session.phase === "greet") {
    const distance = Math.hypot(posB.x - posA.x, posB.y - posA.y);
    const met = distance <= gap * 1.35;
    const timedOut = now - session.startedAt >= GREET_TIMEOUT_MS;
    if (!met && !timedOut) {
      moveToward(components, a, approachStop(posA, posB, gap), APPROACH_SPEED_FACTOR);
      moveToward(components, b, approachStop(posB, posA, gap), APPROACH_SPEED_FACTOR);
      return;
    }
    beginPlay(session, now);
  }
  advancePlayPhase(session, now);

  // play / part — stand together.
  stop(components, a);
  stop(components, b);

  if (session.kind === "greet") {
    if (!session.greeted) {
      setSpeech(components, a, pickLine(GREET_LINES, session.startedAt), now);
      setSpeech(components, b, pickLine(GREET_LINES, session.startedAt + 1), now);
      session.greeted = true;
    }
    const emote = session.phase === "part" ? "sparkle" : "heart";
    setExpression(components, a, "love", emote, now, 400);
    setExpression(components, b, "love", emote, now, 400);
    return;
  }

  // chat — alternate whose bubble shows.
  if (session.phase === "part") {
    setSpeech(components, a, null, now);
    setSpeech(components, b, null, now);
    setExpression(components, a, "happy", "sparkle", now, 400);
    setExpression(components, b, "happy", "sparkle", now, 400);
    return;
  }
  const playElapsed = now - (session.playStartedAt ?? session.startedAt);
  const turn = Math.floor(playElapsed / CHAT_TURN_MS);
  const speaker = turn % 2 === 0 ? a : b;
  const listener = speaker === a ? b : a;
  setSpeech(components, speaker, pickLine(CHAT_LINES, session.startedAt + turn), now);
  setSpeech(components, listener, null, now);
  setExpression(components, a, "thinking", "none", now, 400);
  setExpression(components, b, "thinking", "question", now, 400);
}

function choreographChase(
  components: ComponentStore,
  session: SocialSessionComponent,
  posA: Vec,
  posB: Vec,
  now: number,
  bounds: Bounds,
): void {
  const a = session.initiatorId;
  const b = session.responderId;

  // A chase needs no approach ritual — it kicks off the moment both accept.
  if (session.phase === "greet") beginPlay(session, now);
  advancePlayPhase(session, now);

  if (session.phase === "part") {
    stop(components, a);
    stop(components, b);
    setExpression(components, a, "happy", "sparkle", now, 400);
    setExpression(components, b, "happy", "sparkle", now, 400);
    return;
  }

  const elapsed = now - (session.playStartedAt ?? session.startedAt);
  const initiatorChases = Math.floor(elapsed / CHASE_SWAP_MS) % 2 === 0;
  const chaser = initiatorChases ? a : b;
  const runner = initiatorChases ? b : a;
  const chaserPos = chaser === a ? posA : posB;
  const runnerPos = runner === a ? posA : posB;
  const fleeDistance = bodyWidth(components, runner) * 6;

  moveToward(components, chaser, { ...runnerPos }, CHASE_SPEED_FACTOR);
  moveToward(
    components,
    runner,
    fleeTarget(runnerPos, chaserPos, fleeDistance, bounds),
    CHASE_SPEED_FACTOR,
  );
  setExpression(components, chaser, "excited", "sparkle", now, 400);
  setExpression(components, runner, "excited", "none", now, 400);
}

function endSession(
  components: ComponentStore,
  sessionId: string,
  session: SocialSessionComponent,
  now: number,
): void {
  for (const id of [session.initiatorId, session.responderId]) {
    if (components.getComponent(id, "SocialSessionMember")?.sessionId === sessionId) {
      components.removeComponent(id, "SocialSessionMember");
    }
    stop(components, id);
    refillSocial(components, id, SESSION_SOCIAL_REFILL);
    // Only hold the afterglow when nothing more urgent has grabbed the pet.
    if (!isBlockedByHigherPriority(components, id, now)) {
      claimSocial(components, id, now, "socialized", now + SESSION_AFTERGLOW_MS);
      setExpression(components, id, "happy", "sparkle", now, 500);
    }
  }
  components.destroy(sessionId);
}

// Pass 2 — accept or decline every pending invite.
function resolveInvites(
  components: ComponentStore,
  now: number,
  random: RandomSource,
): void {
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
    const accepts =
      !!personality && random.next() < acceptChance(personality, drives);

    if (accepts) {
      createSession(components, fromId, targetId, invite.kind, now);
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
  initiatorId: string,
  responderId: string,
  kind: SocialSessionKind,
  now: number,
): void {
  const sessionId = `social-${initiatorId}-${responderId}-${now}`;
  components.spawn(sessionId, [
    {
      type: "SocialSession",
      kind,
      initiatorId,
      responderId,
      phase: "greet",
      startedAt: now,
      endsAt: now + maxSessionDurationMs(kind),
      playStartedAt: null,
      greeted: false,
    },
  ]);
  components.setComponent(initiatorId, {
    type: "SocialSessionMember",
    sessionId,
    partnerId: responderId,
    role: "initiator",
  });
  components.setComponent(responderId, {
    type: "SocialSessionMember",
    sessionId,
    partnerId: initiatorId,
    role: "responder",
  });
  const ttl = now + SOCIAL_CLAIM_TTL_MS;
  for (const id of [initiatorId, responderId]) {
    claimSocial(components, id, now, `session-${kind}`, ttl);
    // The session absorbs any startle that was still pending — a stale
    // PendingReaction must not fire a collision response after the party.
    components.removeComponent(id, "PendingReaction");
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
    ["CanSocialize", "Personality", "IntentState", "MotionTarget", "Transform", "ContactState"],
    (id, [, personality, intent, motion, transform, contact]) => {
      if (intent.intent !== "idle") return;
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

// ── System descriptor ────────────────────────────────────────────────────────

export const SocialInteractionSystem: SimulationSystem<WorldStepContext> = {
  name: "SocialInteractionSystem",
  dependsOn: ["WorkingBehaviorSystem"],
  reads: [
    "CanSocialize",
    "Personality",
    "Drives",
    "IntentState",
    "MotionTarget",
    "Transform",
    "ContactState",
    "PhysicsBody",
    "AgentTaskState",
    "BehaviorDecisionState",
    "TaskMovementHold",
    "SocialInvite",
    "SocialSession",
    "SocialSessionMember",
    "PendingReaction",
  ],
  writes: [
    "SocialInvite",
    "SocialSession",
    "SocialSessionMember",
    "BehaviorDecisionState",
    "MotionTarget",
    "IntentState",
    "PetExpressionState",
    "SpeechState",
    "Drives",
    "PendingReaction",
  ],
  update(ctx) {
    runSocialInteractionSystem(
      ctx.components,
      ctx.clock,
      ctx.random,
      ctx.bounds,
      ctx.deltaMs,
    );
  },
};
