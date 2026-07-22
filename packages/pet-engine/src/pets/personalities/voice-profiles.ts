import type { AgentTaskStatus } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import type { SpeechProfileComponent } from "@pets-driven/pet-engine/features/agent/components";
import type {
  PetExpressionEmote,
  PetExpressionMood,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/personalities/registry";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";

type AcknowledgedTaskStatus = Extract<AgentTaskStatus, "waiting" | "failed" | "completed">;

export type AcknowledgeFeedback = {
  /** i18n key (petSpeech.*) resolved to a concrete variant; localized at render. */
  speech: string;
  mood: PetExpressionMood;
  emote: PetExpressionEmote;
};

/**
 * The spoken lines themselves live in the desktop i18n bundle under
 * `petSpeech.<personality>.<slot>.<variant>` (see packages/i18n). The engine
 * only holds the expression cues (mood/emote) that drive the sprite face, plus
 * the machinery to build and randomly pick a localized speech key. Every slot
 * has {@link PET_SPEECH_VARIANT_COUNT} interchangeable variants.
 */
type PersonalityVoiceProfile = {
  acknowledge: Record<
    AcknowledgedTaskStatus,
    { mood: PetExpressionMood; emote: PetExpressionEmote }
  >;
};

/** Key prefix the render layer recognizes as a localizable speech line (vs. free text). */
export const PET_SPEECH_KEY_PREFIX = "petSpeech";

/** Interchangeable line variants each speech slot carries in the i18n bundle. */
export const PET_SPEECH_VARIANT_COUNT = 4;

/** i18n slot names that pair with each SpeechProfile field / acknowledge status. */
const ACKNOWLEDGE_SLOT: Record<AcknowledgedTaskStatus, string> = {
  waiting: "ackWaiting",
  failed: "ackFailed",
  completed: "ackCompleted",
};

/** Base (variant-less) speech key for a personality slot, e.g. `petSpeech.playful.idle`. */
function baseSpeechKey(catalogId: PetPersonalityId, slot: string): string {
  return `${PET_SPEECH_KEY_PREFIX}.${catalogId}.${slot}`;
}

/** Pick a variant index within a slot's pool. */
export function randomSpeechVariant(random: RandomSource): number {
  return Math.floor(random.next() * PET_SPEECH_VARIANT_COUNT);
}

/**
 * Turn a base speech key into a concrete, randomly chosen variant key. Free
 * text (agent-supplied summaries) and `null` pass through untouched, so this is
 * safe to wrap around any candidate message line.
 */
export function resolveSpeechVariant(line: string | null, random: RandomSource): string | null {
  if (!line?.startsWith(`${PET_SPEECH_KEY_PREFIX}.`)) return line;
  return `${line}.${randomSpeechVariant(random)}`;
}

/** Expression cue (mood/emote) for every Personality Catalog acknowledgement beat. */
export const PERSONALITY_VOICE_PROFILES: Record<PetPersonalityId, PersonalityVoiceProfile> = {
  playful: {
    acknowledge: {
      waiting: { mood: "excited", emote: "sparkle" },
      failed: { mood: "excited", emote: "sparkle" },
      completed: { mood: "happy", emote: "sparkle" },
    },
  },
  attentive: {
    acknowledge: {
      waiting: { mood: "love", emote: "heart" },
      failed: { mood: "love", emote: "heart" },
      completed: { mood: "love", emote: "heart" },
    },
  },
  reserved: {
    acknowledge: {
      waiting: { mood: "happy", emote: "none" },
      failed: { mood: "thinking", emote: "question" },
      completed: { mood: "happy", emote: "none" },
    },
  },
  curious: {
    acknowledge: {
      waiting: { mood: "thinking", emote: "question" },
      failed: { mood: "thinking", emote: "question" },
      completed: { mood: "excited", emote: "sparkle" },
    },
  },
  steady: {
    acknowledge: {
      waiting: { mood: "working", emote: "none" },
      failed: { mood: "working", emote: "none" },
      completed: { mood: "happy", emote: "none" },
    },
  },
  feisty: {
    acknowledge: {
      waiting: { mood: "excited", emote: "exclaim" },
      failed: { mood: "excited", emote: "exclaim" },
      completed: { mood: "happy", emote: "sparkle" },
    },
  },
  gentle: {
    acknowledge: {
      waiting: { mood: "love", emote: "heart" },
      failed: { mood: "love", emote: "heart" },
      completed: { mood: "love", emote: "heart" },
    },
  },
  mischievous: {
    acknowledge: {
      waiting: { mood: "excited", emote: "sparkle" },
      failed: { mood: "happy", emote: "sparkle" },
      completed: { mood: "excited", emote: "sparkle" },
    },
  },
  lazy: {
    acknowledge: {
      waiting: { mood: "sleepy", emote: "zzz" },
      failed: { mood: "sleepy", emote: "zzz" },
      completed: { mood: "sleepy", emote: "zzz" },
    },
  },
  zen: {
    acknowledge: {
      waiting: { mood: "happy", emote: "sparkle" },
      failed: { mood: "thinking", emote: "none" },
      completed: { mood: "happy", emote: "sparkle" },
    },
  },
  aloof: {
    acknowledge: {
      waiting: { mood: "working", emote: "none" },
      failed: { mood: "thinking", emote: "none" },
      completed: { mood: "happy", emote: "none" },
    },
  },
  skittish: {
    acknowledge: {
      waiting: { mood: "happy", emote: "sparkle" },
      failed: { mood: "confused", emote: "exclaim" },
      completed: { mood: "confused", emote: "exclaim" },
    },
  },
  shrewd: {
    acknowledge: {
      waiting: { mood: "thinking", emote: "none" },
      failed: { mood: "thinking", emote: "question" },
      completed: { mood: "happy", emote: "none" },
    },
  },
};

/**
 * SpeechProfile carrying *base* speech keys for a catalog personality. The
 * emitting systems resolve a random variant at speak time via
 * {@link resolveSpeechVariant}; the render layer localizes the result.
 */
export function personalitySpeechProfile(
  catalogId: PetPersonalityId | undefined,
): SpeechProfileComponent | null {
  if (!catalogId) return null;
  return {
    type: "SpeechProfile",
    idleCompanion: baseSpeechKey(catalogId, "idle"),
    attentionNeeded: baseSpeechKey(catalogId, "attention"),
    taskStarted: baseSpeechKey(catalogId, "started"),
    taskCompleted: baseSpeechKey(catalogId, "completed"),
  };
}

export function personalityAcknowledgeFeedback(
  catalogId: PetPersonalityId | undefined,
  status: AgentTaskStatus,
  random: RandomSource,
): AcknowledgeFeedback | null {
  if (!catalogId || !statusFreezesForFeedback(status)) return null;
  const cue = PERSONALITY_VOICE_PROFILES[catalogId].acknowledge[status];
  return {
    speech: `${baseSpeechKey(catalogId, ACKNOWLEDGE_SLOT[status])}.${randomSpeechVariant(random)}`,
    mood: cue.mood,
    emote: cue.emote,
  };
}

function statusFreezesForFeedback(status: AgentTaskStatus): status is AcknowledgedTaskStatus {
  return status === "waiting" || status === "failed" || status === "completed";
}
