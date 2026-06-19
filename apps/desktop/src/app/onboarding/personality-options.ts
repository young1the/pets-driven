import {
  createAttentivePersonality,
  createPlayfulPersonality,
  createReservedPersonality,
  type PersonalityFactory,
} from "@/pets/personalities/factories";
import type { PetPersonalityId } from "@/pets/profiles/pet-profile";

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
];
