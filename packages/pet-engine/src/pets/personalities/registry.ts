import {
  createAloofPersonality,
  createAttentivePersonality,
  createCuriousPersonality,
  createFeistyPersonality,
  createGentlePersonality,
  createLazyPersonality,
  createMischievousPersonality,
  createPlayfulPersonality,
  createReservedPersonality,
  createSkittishPersonality,
  createSteadyPersonality,
  createZenPersonality,
  type PersonalityFactory,
} from "./factories";

export type PersonalityRegistryEntry = {
  id: string;
  factory: PersonalityFactory;
};

export const PERSONALITY_REGISTRY = [
  { id: "playful", factory: createPlayfulPersonality },
  { id: "attentive", factory: createAttentivePersonality },
  { id: "reserved", factory: createReservedPersonality },
  { id: "curious", factory: createCuriousPersonality },
  { id: "steady", factory: createSteadyPersonality },
  { id: "feisty", factory: createFeistyPersonality },
  { id: "gentle", factory: createGentlePersonality },
  { id: "mischievous", factory: createMischievousPersonality },
  { id: "lazy", factory: createLazyPersonality },
  { id: "zen", factory: createZenPersonality },
  { id: "aloof", factory: createAloofPersonality },
  { id: "skittish", factory: createSkittishPersonality },
] as const satisfies ReadonlyArray<PersonalityRegistryEntry>;

export type PetPersonalityId = (typeof PERSONALITY_REGISTRY)[number]["id"];
