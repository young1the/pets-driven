import type { PersonalityComponent } from "@pets-driven/pet-engine/core/components";
import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import type { PetsDrivenState } from "@/app-state/pets-driven-state";

export type AdoptedPetSimInput = {
  id: string;
  name: string;
  /** Null when the pet is bound to no folder, so it has no agent to answer to. */
  sourceId: string | null;
  personality: PersonalityComponent;
};

/**
 * OCEAN preset per personality id, sourced directly from the pet-engine
 * personality registry so an adopted pet's temperament always matches the
 * onboarding preset. Deriving it (rather than hand-mirroring the values) keeps
 * this in lock-step with the factories — including any presets added later —
 * and re-derives from `personalityId`, so pets adopted before a preset was
 * retuned pick up its current temperament rather than a stale stored copy.
 */
const PERSONALITY_OCEAN = Object.fromEntries(
  PERSONALITY_REGISTRY.map((entry) => {
    const { openness, conscientiousness, extraversion, agreeableness, neuroticism } =
      entry.factory();
    return [entry.id, { openness, conscientiousness, extraversion, agreeableness, neuroticism }];
  }),
) as Record<PetPersonalityId, Omit<PersonalityComponent, "type">>;

function personalityComponent(id: PetPersonalityId | undefined): PersonalityComponent {
  const catalogId = id ?? "playful";
  return {
    type: "Personality",
    catalogId,
    ...PERSONALITY_OCEAN[catalogId],
  };
}

/**
 * Pick the visible, non-archived pets and shape them into simulation inputs.
 * Each pet's agent source id (from its registered directory) is preserved so
 * the simulated snapshot keeps a stable identity; movement comes from the
 * personality preset.
 */
export function selectAdoptedPetSimInputs(state: PetsDrivenState): AdoptedPetSimInput[] {
  return state.pets
    .filter((pet) => !pet.archived && pet.visible)
    .map((pet) => {
      const profile = state.petProfiles.find((candidate) => candidate.id === pet.profileId);
      const directory = state.registeredWorkingDirectories.find(
        (candidate) => candidate.petId === pet.id,
      );

      return {
        id: pet.id,
        name: pet.name,
        // No folder means no agent source. Falling back to `pet.id` here handed
        // the pet a real, matchable address, which is how an unbound pet ended
        // up showing an agent "Working" capsule.
        sourceId: directory?.agentSourceId ?? null,
        personality: personalityComponent(profile?.personalityId),
      };
    });
}
