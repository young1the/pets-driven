import type { PetsDrivenState } from "@/app-state/pets-driven-state";
import type { PersonalityComponent } from "@pets-driven/pet-engine/core/components";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

export type AdoptedPetSimInput = {
  id: string;
  name: string;
  sourceId: string;
  personality: PersonalityComponent;
};

/**
 * OCEAN presets per personality preset, mirroring the demo scenario's walkers
 * so adopted pets move with a recognisable temperament.
 */
const PERSONALITY_OCEAN: Record<
  PetPersonalityId,
  Omit<PersonalityComponent, "type">
> = {
  playful: {
    openness: 0.7,
    conscientiousness: 0.4,
    extraversion: 0.85,
    agreeableness: 0.5,
    neuroticism: 0.1,
  },
  attentive: {
    openness: 0.3,
    conscientiousness: 0.6,
    extraversion: 0.8,
    agreeableness: 0.8,
    neuroticism: 0.2,
  },
  reserved: {
    openness: 0.3,
    conscientiousness: 0.5,
    extraversion: 0.2,
    agreeableness: 0.4,
    neuroticism: 0.75,
  },
};

function personalityComponent(
  id: PetPersonalityId | undefined,
): PersonalityComponent {
  return { type: "Personality", ...PERSONALITY_OCEAN[id ?? "playful"] };
}

/**
 * Pick the visible, non-archived pets and shape them into simulation inputs.
 * Each pet's agent source id (from its registered directory) is preserved so
 * the simulated snapshot keeps a stable identity; movement comes from the
 * personality preset.
 */
export function selectAdoptedPetSimInputs(
  state: PetsDrivenState,
): AdoptedPetSimInput[] {
  return state.pets
    .filter((pet) => !pet.archived && pet.visible)
    .map((pet) => {
      const profile = state.petProfiles.find(
        (candidate) => candidate.id === pet.profileId,
      );
      const directory = state.registeredWorkingDirectories.find(
        (candidate) => candidate.petId === pet.id,
      );

      return {
        id: pet.id,
        name: pet.name,
        sourceId: directory?.agentSourceId ?? pet.id,
        personality: personalityComponent(profile?.personalityId),
      };
    });
}
