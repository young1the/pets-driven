/**
 * Shared mood model for the desktop-pet status primitives. Maps an agent-ish
 * mood to a face, a default corner emote, an accent color and a default
 * capsule label. Adapted from the design bundle's PetStatus/PetCompanion —
 * the sprite art itself lives in the app, not here.
 */

export type PetMood = "working" | "happy" | "love" | "excited" | "thinking" | "sleepy" | "confused";

export type PetEmoteKind = "none" | "heart" | "zzz" | "sparkle" | "question" | "exclaim";

type PetMoodSpec = {
  face: string;
  emote: PetEmoteKind;
  /** CSS color expression for the capsule/bubble accent. */
  accent: string;
  defaultLabel: string;
};

export const PET_MOODS: Record<PetMood, PetMoodSpec> = {
  working: {
    face: "🙂",
    emote: "none",
    accent: "var(--color-info)",
    defaultLabel: "Working",
  },
  happy: {
    face: "😄",
    emote: "sparkle",
    accent: "var(--color-success)",
    defaultLabel: "Done",
  },
  love: {
    face: "🥰",
    emote: "heart",
    accent: "var(--color-primary)",
    defaultLabel: "Done",
  },
  excited: {
    face: "🤩",
    emote: "sparkle",
    accent: "var(--color-accent)",
    defaultLabel: "Excited",
  },
  thinking: {
    face: "🤔",
    emote: "none",
    accent: "var(--color-info)",
    defaultLabel: "Thinking",
  },
  sleepy: {
    face: "😴",
    emote: "zzz",
    accent: "var(--ink-500)",
    defaultLabel: "Napping",
  },
  confused: {
    face: "😕",
    emote: "question",
    accent: "var(--color-warning)",
    defaultLabel: "Needs you",
  },
};
