import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import type { PersonalityFactory } from "@pets-driven/pet-engine/pets/personalities/factories";

export type PersonalityOption = {
  id: PetPersonalityId;
  title: string;
  blurb: string;
  factory: PersonalityFactory;
};

const PERSONALITY_LABELS: Record<PetPersonalityId, { title: string; blurb: string }> = {
  playful:     { title: "Playful",     blurb: "First to the party, last to nap. Explores every corner of the screen." },
  attentive:   { title: "Attentive",   blurb: "Sticks close and checks in often. Loves reporting back to you." },
  reserved:    { title: "Reserved",    blurb: "Quiet and careful. Prefers a cozy spot and steady work." },
  curious:     { title: "Curious",     blurb: "Investigates every odd corner, then comes back with findings." },
  steady:      { title: "Steady",      blurb: "Calm, consistent, and hard to rattle. Keeps the rhythm smooth." },
  bold:        { title: "Bold",        blurb: "Leans into the action and checks things out up close." },
  gentle:      { title: "Gentle",      blurb: "Warm and unhurried. Drifts your way and stays close without fuss." },
  mischievous: { title: "Mischievous", blurb: "Unpredictable and impulsive. You never quite know what it'll do next." },
  lazy:        { title: "Lazy",        blurb: "Barely moves. Perfectly content to just exist in one cozy spot." },
  zen:         { title: "Zen",         blurb: "Unhurried and unflappable. Moves with quiet purpose, never in a rush." },
};

export const PERSONALITY_OPTIONS: PersonalityOption[] = PERSONALITY_REGISTRY.map((entry) => ({
  ...PERSONALITY_LABELS[entry.id as PetPersonalityId],
  id: entry.id as PetPersonalityId,
  factory: entry.factory,
}));
