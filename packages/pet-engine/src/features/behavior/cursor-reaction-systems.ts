import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { utteranceChannel } from "@pets-driven/pet-engine/features/agent/components";
import {
  claim,
  isClaimedBySameOrHigherPriority,
  SPEECH_BUBBLE_DURATION_MS,
  stopPetMovement,
  type VelocityWriter,
} from "@pets-driven/pet-engine/features/behavior/claim";
import type {
  PersonalityComponent,
  PetExpressionEmote,
  PetExpressionMood,
} from "@pets-driven/pet-engine/features/behavior/components";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import { personalityAcknowledgeFeedback } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * Priority-1 cursor play: the two systems that read the live cursor and react
 * to it directly — stroking a pet (petting) and resting the pointer on a
 * moving one (hover).
 */

// Cursor play — petting (cursor lingers over the pet's body and oscillates).
const PETTING_OSCILLATION_WINDOW_MS = 1_500;
const PETTING_MIN_REVERSALS = 3;
const PETTING_MAX_DISPLACEMENT_PX = 60;
const PETTING_DURATION_MS = 900;
const PETTING_BODY_PADDING = 8;

// Cursor play — hover (cursor rests over a moving pet: stop + react once).
const HOVER_BODY_PADDING = 8;
const HOVER_REACTION_DURATION_MS = 1_200;

// ── Cursor play: petting detection (priority 1, alongside user-interaction) ──
//
// Runs right after UserInteractionBehaviorSystem so DragInteraction reflects
// this tick's pointer events. When the cursor lingers within a pet's body
// bounds and oscillates horizontally (stroking motion, not a swipe-through),
// claims user-interaction with reason "petting" and shows a love reaction.
// Skips any pet currently being dragged by the same pointer.
//
// Petting is also the only interaction that releases an agent task: any
// AgentTaskState (working/waiting/failed/completed) clears along with the
// movement hold and the agent-task channel badge. Pressing or dragging a pet
// deliberately does NOT release it, so a hold survives casual clicks until
// the user strokes the pet.

function findCursorState(components: ComponentStore): {
  position: { x: number; y: number } | null;
  samples: Array<{ at: number; position: { x: number; y: number } }>;
} | null {
  let found: {
    position: { x: number; y: number } | null;
    samples: Array<{ at: number; position: { x: number; y: number } }>;
  } | null = null;
  components.forEach(["CursorState"], (_id, [state]) => {
    if (!found) found = { position: state.position, samples: state.samples };
  });
  return found;
}

function horizontalOscillation(
  samples: Array<{ at: number; position: { x: number; y: number } }>,
  now: number,
): { reversals: number; displacement: number } {
  const recent = samples.filter((sample) => now - sample.at <= PETTING_OSCILLATION_WINDOW_MS);
  if (recent.length < 3) return { reversals: 0, displacement: 0 };

  let reversals = 0;
  let lastSign = 0;
  let minX = recent[0].position.x;
  let maxX = recent[0].position.x;
  for (let i = 1; i < recent.length; i += 1) {
    const dx = recent[i].position.x - recent[i - 1].position.x;
    minX = Math.min(minX, recent[i].position.x);
    maxX = Math.max(maxX, recent[i].position.x);
    if (dx === 0) continue;
    const sign = dx > 0 ? 1 : -1;
    if (lastSign !== 0 && sign !== lastSign) reversals += 1;
    lastSign = sign;
  }
  return { reversals, displacement: maxX - minX };
}

// Petting acknowledges whatever the agent reported: the movement hold lifts
// and the task state clears no matter the status — working included, so a
// stroke also dismisses a stale "working" report. Settled statuses
// (waiting/failed/completed) speak the personality acknowledge line and show
// that personality's own acknowledge cue (mood + emote), so the pet reacts in
// character to being accepted. A released "working" state has no acknowledge
// beat, so it keeps the plain petting love reaction set by the caller.
function releaseAgentTaskOnPetting(
  components: ComponentStore,
  id: string,
  now: number,
  random: RandomSource,
): void {
  const task = components.getComponent(id, "AgentTaskState");
  components.removeComponent(id, "TaskMovementHold");
  if (!task) return;

  const personality = components.getComponent(id, "Personality");
  const feedback = personalityAcknowledgeFeedback(personality?.catalogId, task.status, random);
  components.removeComponent(id, "AgentTaskState");

  const channel = components.getComponent(id, "AgentChannelState");
  if (channel?.source === "agent-task") {
    components.removeComponent(id, "AgentChannelState");
  }

  if (feedback) {
    const durationMs = SPEECH_BUBBLE_DURATION_MS;
    components.setComponent(
      id,
      utteranceChannel({ message: feedback.speech, source: "interaction", now, durationMs }),
    );
    // The release surfaces the personality's own acknowledge cue rather than a
    // unified heart — a playful pet sparkles, a lazy one keeps dozing. The
    // double-click dismissal keeps its fixed happy/note cue, so the two
    // gestures stay visually distinct on the same settled task (PET-23).
    components.setComponent(id, {
      type: "PetExpressionState",
      source: "acknowledge",
      mood: feedback.mood,
      emote: feedback.emote,
      label: null,
      startedAt: now,
      expiresAt: now + durationMs,
    });
    claim(components, id, "user-interaction", now, `acknowledge-${task.status}`, now + durationMs);
    recordPetExperience(components, id, "acknowledged", now);
  }
}

export function runPettingDetectionSystem(
  components: ComponentStore,
  clock: Clock,
  physics?: VelocityWriter,
  random: RandomSource = createSeededRandom(1),
): void {
  const now = clock.now();
  const cursor = findCursorState(components);
  if (!cursor?.position) return;
  const cursorPosition = cursor.position;

  const { reversals, displacement } = horizontalOscillation(cursor.samples, now);
  const isOscillating =
    reversals >= PETTING_MIN_REVERSALS && displacement <= PETTING_MAX_DISPLACEMENT_PX;
  if (!isOscillating) return;

  const drag = components.getComponent("user-interaction", "DragInteraction");

  components.forEach(["Transform", "PhysicsBody", "PetIdentity"], (id, [transform, body]) => {
    if (drag && drag.entityId === id) return;

    const halfW = body.width / 2 + PETTING_BODY_PADDING;
    const halfH = body.height / 2 + PETTING_BODY_PADDING;
    const withinBounds =
      Math.abs(cursorPosition.x - transform.position.x) <= halfW &&
      Math.abs(cursorPosition.y - transform.position.y) <= halfH;
    if (!withinBounds) return;

    const existing = components.getComponent(id, "BehaviorDecisionState");
    const alreadyPetting =
      existing?.source === "user-interaction" &&
      existing.reason === "petting" &&
      existing.expiresAt > now;

    if (alreadyPetting) {
      // Extend the reaction instead of restarting it every frame so
      // continuous petting doesn't reset the love expression's timer.
      existing.expiresAt = now + PETTING_DURATION_MS;
      const expression = components.getComponent(id, "PetExpressionState");
      if (expression && expression.source === "petting") {
        expression.expiresAt = now + PETTING_DURATION_MS;
      }
      return;
    }

    if (isClaimedBySameOrHigherPriority(components, id, "user-interaction", now)) return;

    claim(components, id, "user-interaction", now, "petting", now + PETTING_DURATION_MS);
    components.setComponent(id, { type: "Steering", mode: "stand" });
    stopPetMovement(components, physics, id);
    components.setComponent(id, {
      type: "PetExpressionState",
      source: "petting",
      mood: "love",
      emote: "heart",
      label: null,
      startedAt: now,
      expiresAt: now + PETTING_DURATION_MS,
    });
    recordPetExperience(components, id, "petted", now);
    // After the petting claim/expression, so a settled status's acknowledge
    // beat (claim + expression + speech) overrides the plain love reaction.
    releaseAgentTaskOnPetting(components, id, now, random);
  });
}

// ── Cursor play: hover reaction (priority 1, alongside user-interaction) ────
//
// When the cursor comes to rest over a pet that is currently moving, the pet
// stops on the spot and reacts according to its dominant personality trait.
// One-shot: the claim is NOT extended while the cursor stays put, so petting
// (which needs an unclaimed pet) can take over once the reaction expires. If
// the pet starts moving under the cursor again, the reaction re-triggers —
// hovering effectively holds the pet's attention.

type HoverReaction = {
  reason: string;
  mood: PetExpressionMood;
  emote: PetExpressionEmote;
};

/**
 * Dominant-trait reaction. Ties resolve in listed order (anxious pets startle
 * before sociable pets greet) so the same personality always reacts the same
 * way. Conscientiousness has no hover pose — it shapes follow-through, not
 * social reactions.
 */
export function hoverReactionFor(personality: PersonalityComponent): HoverReaction {
  const candidates: Array<{ weight: number; reaction: HoverReaction }> = [
    {
      weight: personality.neuroticism,
      reaction: { reason: "hover-startle", mood: "confused", emote: "exclaim" },
    },
    {
      weight: personality.extraversion,
      reaction: { reason: "hover-greet", mood: "excited", emote: "sparkle" },
    },
    {
      weight: personality.agreeableness,
      reaction: { reason: "hover-affection", mood: "love", emote: "heart" },
    },
    {
      weight: personality.openness,
      reaction: { reason: "hover-observe", mood: "thinking", emote: "question" },
    },
  ];
  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.weight > best.weight) best = candidate;
  }
  return best.reaction;
}

export function runHoverReactionSystem(
  components: ComponentStore,
  clock: Clock,
  physics?: VelocityWriter,
): void {
  const now = clock.now();
  const cursor = findCursorState(components);
  if (!cursor?.position) return;
  const cursorPosition = cursor.position;

  const drag = components.getComponent("user-interaction", "DragInteraction");

  components.forEach(
    ["Transform", "PhysicsBody", "PetIdentity", "Personality"],
    (id, [transform, body, , personality]) => {
      if (drag && drag.entityId === id) return;

      // Only moving pets react — a parked or held pet has nothing to stop.
      const mode = components.getComponent(id, "Steering")?.mode ?? "stand";
      if (mode === "stand") return;
      if (components.getComponent(id, "TaskMovementHold")) return;

      const halfW = body.width / 2 + HOVER_BODY_PADDING;
      const halfH = body.height / 2 + HOVER_BODY_PADDING;
      const withinBounds =
        Math.abs(cursorPosition.x - transform.position.x) <= halfW &&
        Math.abs(cursorPosition.y - transform.position.y) <= halfH;
      if (!withinBounds) return;

      if (isClaimedBySameOrHigherPriority(components, id, "user-interaction", now)) return;

      const reaction = hoverReactionFor(personality);
      claim(
        components,
        id,
        "user-interaction",
        now,
        reaction.reason,
        now + HOVER_REACTION_DURATION_MS,
      );
      components.setComponent(id, { type: "Steering", mode: "stand" });
      stopPetMovement(components, physics, id);
      components.setComponent(id, {
        type: "PetExpressionState",
        source: "hover",
        mood: reaction.mood,
        emote: reaction.emote,
        label: null,
        startedAt: now,
        expiresAt: now + HOVER_REACTION_DURATION_MS,
      });
    },
  );
}
