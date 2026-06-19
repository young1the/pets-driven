import type {
  PetRecord,
  PetsDrivenState,
  RegisteredWorkingDirectory,
} from "@/app-state/pets-driven-state";
import type { PetPersonality } from "@/pets/personalities/factories";
import type { PetPersonalityId } from "@/pets/profiles/pet-profile";

export type AdoptPetInput = {
  id: string;
  profileId: string;
  name: string;
  assetId: string;
  personalityId: PetPersonalityId;
  personality: PetPersonality;
  now: number;
};

/** Append a new pet record + profile atomically. No directory link yet. */
export function adoptPet(
  state: PetsDrivenState,
  input: AdoptPetInput,
): PetsDrivenState {
  return {
    ...state,
    pets: [
      ...state.pets,
      {
        id: input.id,
        workingDirectoryId: null,
        assetId: input.assetId,
        profileId: input.profileId,
        name: input.name,
        adoptedAt: input.now,
        archived: false,
        visible: true,
      },
    ],
    petProfiles: [
      ...state.petProfiles,
      {
        id: input.profileId,
        petAssetId: input.assetId,
        personalityId: input.personalityId,
        personality: input.personality,
      },
    ],
  };
}

/**
 * Link a pet to a working directory, enforcing 1 directory : 1 pet in both
 * directions. This is the only mutation path for links: it re-points the
 * directory's petId, clears the back-pointer of any pet previously linked
 * to that directory, and clears the pet's previous directory link.
 */
export function linkPetToWorkingDirectory(
  state: PetsDrivenState,
  petId: string,
  workingDirectoryId: string,
): PetsDrivenState {
  const targetDirectory = state.registeredWorkingDirectories.find(
    (workingDirectory) => workingDirectory.id === workingDirectoryId,
  );
  const targetPet = state.pets.find((pet) => pet.id === petId);

  if (!targetDirectory || !targetPet) {
    return state;
  }

  return {
    ...state,
    registeredWorkingDirectories: state.registeredWorkingDirectories.map(
      (workingDirectory) =>
        workingDirectory.id === workingDirectoryId
          ? { ...workingDirectory, petId }
          : workingDirectory,
    ),
    pets: state.pets.map((pet) => {
      if (pet.id === petId) {
        return { ...pet, workingDirectoryId };
      }

      if (pet.workingDirectoryId === workingDirectoryId) {
        return { ...pet, workingDirectoryId: null };
      }

      return pet;
    }),
  };
}

export function getWorkingDirectoryForPet(
  state: PetsDrivenState,
  petId: string,
): RegisteredWorkingDirectory | null {
  return (
    state.registeredWorkingDirectories.find(
      (workingDirectory) => workingDirectory.petId === petId,
    ) ?? null
  );
}

export function getPetForWorkingDirectory(
  state: PetsDrivenState,
  workingDirectoryId: string,
): PetRecord | null {
  const workingDirectory = state.registeredWorkingDirectories.find(
    (candidate) => candidate.id === workingDirectoryId,
  );

  if (!workingDirectory) {
    return null;
  }

  return state.pets.find((pet) => pet.id === workingDirectory.petId) ?? null;
}
