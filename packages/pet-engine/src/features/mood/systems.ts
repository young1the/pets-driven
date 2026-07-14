import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import type {
  BehaviorDecisionKind,
  PersonalityComponent,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { MoodStateComponent, PetExperienceKind } from "./components";

const EXPERIENCE_MEMORY_MS = 45_000;
const EXPERIENCE_MEMORY_LIMIT = 8;
const MOOD_RECOVERY_MS = 18_000;

export type MoodImpact = {
  valence: number;
  arousal: number;
  confidence: number;
};

export const EXPERIENCE_IMPACT: Record<PetExperienceKind, MoodImpact> = {
  petted: { valence: 0.35, arousal: -0.15, confidence: 0.1 },
  startled: { valence: -0.18, arousal: 0.45, confidence: -0.2 },
  "task-started": { valence: 0.05, arousal: 0.15, confidence: 0.05 },
  "task-waiting": { valence: -0.12, arousal: 0.2, confidence: -0.05 },
  "task-failed": { valence: -0.45, arousal: 0.35, confidence: -0.25 },
  "task-completed": { valence: 0.4, arousal: -0.1, confidence: 0.2 },
  socialized: { valence: 0.45, arousal: -0.12, confidence: 0.18 },
  acknowledged: { valence: 0.22, arousal: -0.25, confidence: 0.15 },
  rested: { valence: 0.18, arousal: -0.3, confidence: 0.08 },
  "self-soothed": { valence: 0.22, arousal: -0.4, confidence: 0.18 },
  played: { valence: 0.3, arousal: 0.12, confidence: 0.15 },
};

export function initialMoodState(personality: PersonalityComponent): MoodStateComponent {
  return {
    type: "MoodState",
    valence: 0,
    arousal: baselineArousal(personality),
    confidence: baselineConfidence(personality),
  };
}

export function recordPetExperience(
  components: ComponentStore,
  id: string,
  kind: PetExperienceKind,
  at: number,
): void {
  const mood = components.getComponent(id, "MoodState");
  const memory = components.getComponent(id, "RecentExperienceMemory");
  if (!mood || !memory) return;

  const impact = EXPERIENCE_IMPACT[kind];
  mood.valence = clamp(mood.valence + impact.valence, -1, 1);
  mood.arousal = clamp(mood.arousal + impact.arousal, 0, 1);
  mood.confidence = clamp(mood.confidence + impact.confidence, 0, 1);

  memory.entries = memory.entries
    .filter((entry) => at - entry.at < EXPERIENCE_MEMORY_MS)
    .concat({
      kind,
      at,
      valenceDelta: impact.valence,
      arousalDelta: impact.arousal,
      confidenceDelta: impact.confidence,
    })
    .slice(-EXPERIENCE_MEMORY_LIMIT);
}

export function runMoodRecoverySystem(
  components: ComponentStore,
  now: number,
  deltaMs: number,
): void {
  const recovery = 1 - Math.exp(-deltaMs / MOOD_RECOVERY_MS);
  components.forEach(
    ["MoodState", "RecentExperienceMemory", "Personality"],
    (_id, [mood, memory, personality]) => {
      memory.entries = memory.entries.filter((entry) => now - entry.at < EXPERIENCE_MEMORY_MS);
      mood.valence = approach(mood.valence, 0, recovery);
      mood.arousal = approach(mood.arousal, baselineArousal(personality), recovery);
      mood.confidence = approach(mood.confidence, baselineConfidence(personality), recovery);
    },
  );
}

/** Apply the current emotional context after personality and drive scoring. */
export function moodAdjustedDecisionScore(
  kind: BehaviorDecisionKind,
  baseScore: number,
  mood: MoodStateComponent | undefined,
): number {
  if (!mood) return baseScore;
  const positive = Math.max(0, mood.valence);
  const negative = Math.max(0, -mood.valence);
  const fear = mood.arousal * (1 - mood.confidence);

  switch (kind) {
    case "play-romp":
    case "play-feint":
    case "strut":
    case "chase-cursor":
    case "greet":
      return baseScore + positive * 0.3 + mood.arousal * 0.12 - negative * 0.2;
    case "seek-user":
    case "beckon":
    case "keep-watch":
    case "offer-comfort":
      return baseScore + negative * 0.2 + fear * 0.15;
    case "wander-far":
    case "request-climb":
      return baseScore + mood.confidence * 0.18 - fear * 0.28;
    case "flee-from-pet":
    case "collision-flee":
    case "collision-avoid":
      return baseScore + fear * 0.45;
    case "collision-unfazed":
    case "collision-stay":
      return baseScore + mood.confidence * 0.22 - fear * 0.2;
    case "fret":
    case "stand-lookout":
      return baseScore + negative * 0.4 + fear * 0.25;
    case "peek":
    case "inspect":
      return baseScore + (1 - mood.confidence) * 0.18 - fear * 0.08;
    case "withdraw":
      return baseScore + negative * 0.2 + mood.confidence * 0.12;
    case "idle-stay":
    case "nap":
    case "meditate":
    case "groom":
    case "follow-routine":
      return baseScore + negative * 0.15 + (1 - mood.arousal) * 0.1;
    default:
      return baseScore;
  }
}

function baselineArousal(personality: PersonalityComponent): number {
  return clamp(0.15 + personality.extraversion * 0.25 + personality.neuroticism * 0.2, 0, 1);
}

function baselineConfidence(personality: PersonalityComponent): number {
  return clamp(0.3 + (1 - personality.neuroticism) * 0.5 + personality.extraversion * 0.1, 0, 1);
}

function approach(value: number, target: number, amount: number): number {
  return value + (target - value) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const MoodRecoverySystem: SimulationSystem<WorldStepContext> = {
  name: "MoodRecoverySystem",
  dependsOn: ["DriveDecaySystem"],
  reads: ["MoodState", "RecentExperienceMemory", "Personality"],
  writes: ["MoodState", "RecentExperienceMemory"],
  update(ctx) {
    runMoodRecoverySystem(ctx.components, ctx.clock.now(), ctx.deltaMs);
  },
};
