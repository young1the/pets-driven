import {
  createAttentivePersonality,
  createBoldPersonality,
  createCuriousPersonality,
  createPlayfulPersonality,
  createReservedPersonality,
  createSteadyPersonality,
  type PersonalityFactory,
} from "@pets-driven/pet-engine/pets/personalities/factories";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

export type PersonalityOption = {
  id: PetPersonalityId;
  title: string;
  blurb: string;
  factory: PersonalityFactory;
};

export const PERSONALITY_OPTIONS: PersonalityOption[] = [
  {
    id: "playful",
    title: "Playful",
    blurb: "First to the party, last to nap. Explores every corner of the screen.",
    factory: createPlayfulPersonality,
  },
  {
    id: "attentive",
    title: "Attentive",
    blurb: "Sticks close and checks in often. Loves reporting back to you.",
    factory: createAttentivePersonality,
  },
  {
    id: "reserved",
    title: "Reserved",
    blurb: "Quiet and careful. Prefers a cozy spot and steady work.",
    factory: createReservedPersonality,
  },
  {
    id: "curious",
    title: "Curious",
    blurb: "Investigates every odd corner, then comes back with findings.",
    factory: createCuriousPersonality,
  },
  {
    id: "steady",
    title: "Steady",
    blurb: "Calm, consistent, and hard to rattle. Keeps the rhythm smooth.",
    factory: createSteadyPersonality,
  },
  {
    id: "bold",
    title: "Bold",
    blurb: "Leans into the action and checks things out up close.",
    factory: createBoldPersonality,
  },
];
