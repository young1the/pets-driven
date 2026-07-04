import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import type { PersonalityFactory } from "@pets-driven/pet-engine/pets/personalities/factories";

export type PersonalityOption = {
  id: PetPersonalityId;
  factory: PersonalityFactory;
};

/**
 * Personality presets offered during onboarding. Titles and blurbs are not
 * stored here — they live in the `personality.*` keys of the desktop
 * translation bundle and are resolved at render time from the `id`.
 */
export const PERSONALITY_OPTIONS: PersonalityOption[] = PERSONALITY_REGISTRY.map(
  (entry) => ({
    id: entry.id as PetPersonalityId,
    factory: entry.factory,
  }),
);

/** Translation key for a personality's short title. */
export function personalityTitleKey(id: PetPersonalityId): string {
  return `personality.${id}.title`;
}

/** Translation key for a personality's one-line blurb. */
export function personalityBlurbKey(id: PetPersonalityId): string {
  return `personality.${id}.blurb`;
}
