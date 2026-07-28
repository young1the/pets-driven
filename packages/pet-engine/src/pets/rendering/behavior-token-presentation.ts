import type { PetExpressionMood } from "@pets-driven/pet-engine/core/components";
import type { PetExpressionSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import type { BehaviorDecisionKind } from "@pets-driven/pet-engine/features/behavior/components";
import type { PetEmoteKind, PetMood } from "@pets-driven/pet-engine/pets/status/pet-mood";

export type BehaviorTokenTone = "affection" | "alert" | "calm" | "curious" | "motion" | "spark";

export type BehaviorTokenPresentation = {
  emote: PetEmoteKind;
  label: string;
  mood: PetMood;
  tone: BehaviorTokenTone;
};

const BEHAVIOR_TOKEN_PRESENTATION: Record<BehaviorDecisionKind, BehaviorTokenPresentation> = {
  // Ambling is background life — a "?" made every stroll look like a puzzle.
  "wander-near": {
    emote: "none",
    label: "Nearby wander",
    mood: "thinking",
    tone: "curious",
  },
  "wander-far": {
    emote: "dots",
    label: "Far wander",
    mood: "thinking",
    tone: "curious",
  },
  "seek-user": {
    emote: "exclaim",
    label: "Seeking user",
    mood: "confused",
    tone: "alert",
  },
  "request-jump": {
    emote: "sparkle",
    label: "Jump request",
    mood: "excited",
    tone: "spark",
  },
  "request-climb": {
    // Effort, not alarm.
    emote: "sweat",
    label: "Climb request",
    mood: "working",
    tone: "motion",
  },
  "fetch-item": {
    emote: "sparkle",
    label: "Going for a trinket",
    mood: "excited",
    tone: "spark",
  },
  "idle-stay": {
    emote: "zzz",
    label: "Staying idle",
    mood: "sleepy",
    tone: "calm",
  },
  "work-focus": {
    emote: "dots",
    label: "Focusing",
    mood: "working",
    tone: "calm",
  },
  "work-review": {
    emote: "question",
    label: "Reviewing",
    mood: "thinking",
    tone: "curious",
  },
  "work-pace": {
    emote: "dots",
    label: "Pacing",
    mood: "working",
    tone: "motion",
  },
  "approach-pet": {
    emote: "heart",
    label: "Approaching pet",
    mood: "love",
    tone: "affection",
  },
  "flee-from-pet": {
    emote: "sweat",
    label: "Fleeing from pet",
    mood: "confused",
    tone: "alert",
  },
  "collision-flee": {
    emote: "sweat",
    label: "Collision flee",
    mood: "confused",
    tone: "alert",
  },
  "collision-engage": {
    emote: "heart",
    label: "Collision engage",
    mood: "love",
    tone: "affection",
  },
  "collision-avoid": {
    // A composed sidestep reads differently from a panicked one.
    emote: "dots",
    label: "Collision avoid",
    mood: "confused",
    tone: "alert",
  },
  "collision-jump": {
    emote: "sparkle",
    label: "Collision jump",
    mood: "excited",
    tone: "spark",
  },
  "collision-stay": {
    emote: "zzz",
    label: "Collision stay",
    mood: "sleepy",
    tone: "calm",
  },
  "collision-unfazed": {
    // Being unbothered is the whole point; any symbol contradicts it.
    emote: "none",
    label: "Collision unfazed",
    mood: "working",
    tone: "calm",
  },
  "chase-cursor": {
    emote: "sparkle",
    label: "Chasing cursor",
    mood: "excited",
    tone: "spark",
  },
  "play-romp": {
    emote: "note",
    label: "Romping around",
    mood: "excited",
    tone: "spark",
  },
  nap: {
    emote: "zzz",
    label: "Taking a nap",
    mood: "sleepy",
    tone: "calm",
  },
  meditate: {
    emote: "dots",
    label: "Meditating",
    mood: "happy",
    tone: "calm",
  },
  "play-feint": {
    emote: "note",
    label: "Playing a trick",
    mood: "excited",
    tone: "spark",
  },
  "keep-watch": {
    emote: "dots",
    label: "Keeping watch",
    mood: "love",
    tone: "affection",
  },
  peek: {
    emote: "dots",
    label: "Peeking from afar",
    mood: "thinking",
    tone: "curious",
  },
  withdraw: {
    emote: "none",
    label: "Seeking solitude",
    mood: "thinking",
    tone: "calm",
  },
  inspect: {
    emote: "question",
    label: "Investigating",
    mood: "thinking",
    tone: "curious",
  },
  "follow-routine": {
    emote: "none",
    label: "Following a routine",
    mood: "working",
    tone: "calm",
  },
  strut: {
    emote: "note",
    label: "Strutting",
    mood: "excited",
    tone: "spark",
  },
  "offer-comfort": {
    emote: "heart",
    label: "Offering comfort",
    mood: "love",
    tone: "affection",
  },
  "stand-lookout": {
    emote: "exclaim",
    label: "Keeping lookout",
    mood: "confused",
    tone: "alert",
  },
  greet: {
    emote: "sparkle",
    label: "Saying hi",
    mood: "happy",
    tone: "calm",
  },
  groom: {
    emote: "note",
    label: "Tidying up",
    mood: "working",
    tone: "calm",
  },
  observe: {
    emote: "question",
    label: "Looking around",
    mood: "thinking",
    tone: "curious",
  },
  beckon: {
    emote: "heart",
    label: "Come here",
    mood: "love",
    tone: "affection",
  },
  fret: {
    emote: "sweat",
    label: "Fretting",
    mood: "confused",
    tone: "alert",
  },
  // Second signature poses.
  caper: {
    emote: "note",
    label: "Capering about",
    mood: "excited",
    tone: "spark",
  },
  "check-in": {
    emote: "heart",
    label: "Checking in",
    mood: "love",
    tone: "affection",
  },
  "hide-away": {
    emote: "dots",
    label: "Hiding away",
    mood: "thinking",
    tone: "calm",
  },
  "explore-nook": {
    emote: "question",
    label: "Exploring a nook",
    mood: "thinking",
    tone: "curious",
  },
  "tidy-up": {
    emote: "note",
    label: "Tidying up",
    mood: "working",
    tone: "calm",
  },
  posture: {
    emote: "exclaim",
    label: "Posturing",
    mood: "excited",
    tone: "spark",
  },
  nurture: {
    emote: "heart",
    label: "Nurturing",
    mood: "love",
    tone: "affection",
  },
  scheme: {
    emote: "sparkle",
    label: "Scheming",
    mood: "excited",
    tone: "spark",
  },
  lounge: {
    emote: "zzz",
    label: "Lounging",
    mood: "sleepy",
    tone: "calm",
  },
  center: {
    emote: "dots",
    label: "Centering",
    mood: "happy",
    tone: "calm",
  },
  preen: {
    emote: "none",
    label: "Preening",
    mood: "working",
    tone: "calm",
  },
  "startle-scan": {
    emote: "sweat",
    label: "Scanning nervously",
    mood: "confused",
    tone: "alert",
  },
  appraise: {
    emote: "dots",
    label: "Appraising",
    mood: "thinking",
    tone: "curious",
  },
};

export function presentBehaviorDecisionToken(
  kind: string | null | undefined,
): BehaviorTokenPresentation | null {
  if (!kind) return null;
  return BEHAVIOR_TOKEN_PRESENTATION[kind as BehaviorDecisionKind] ?? null;
}

function toneFromExpressionMood(mood: PetExpressionMood): BehaviorTokenTone {
  switch (mood) {
    case "working":
      return "calm";
    case "happy":
      return "calm";
    case "love":
      return "affection";
    case "excited":
      return "spark";
    case "thinking":
      return "curious";
    case "sleepy":
      return "calm";
    case "confused":
      return "alert";
  }

  const exhaustiveMood: never = mood;
  return exhaustiveMood;
}

export function presentPetExpression(
  expression: PetExpressionSnapshot | null | undefined,
): BehaviorTokenPresentation | null {
  if (!expression) return null;
  if (expression.emote === "none") return null;
  return {
    emote: expression.emote,
    label: expression.label ?? "Pet expression",
    mood: expression.mood,
    tone: toneFromExpressionMood(expression.mood),
  };
}
