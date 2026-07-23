import type { PetPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import {
  normalizeWorkingDirectoryPath,
  type PetRecord,
  type PetsDrivenState,
  type RegisteredWorkingDirectory,
} from "@/app-state/pets-driven-state";

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
export function adoptPet(state: PetsDrivenState, input: AdoptPetInput): PetsDrivenState {
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
 * Re-skin an existing pet: point it at another installed Pet Asset.
 *
 * A Pet Asset is first chosen at Pet Birth, but it is a presentation choice
 * rather than an identity, so it stays editable afterwards. The id is stored
 * twice — on the pet (what the overlay window renders) and on its profile
 * (what pet-engine validates) — and the two must never disagree, so this is the
 * only mutation path for it. Mirrors `apply_pet_update` in
 * `src-tauri/src/state_store.rs`. Returns the same state reference when the pet
 * does not exist or already wears that asset.
 */
export function setPetAsset(
  state: PetsDrivenState,
  petId: string,
  assetId: string,
): PetsDrivenState {
  const pet = state.pets.find((candidate) => candidate.id === petId);

  if (!pet || pet.assetId === assetId) {
    return state;
  }

  return {
    ...state,
    pets: state.pets.map((candidate) =>
      candidate.id === petId ? { ...candidate, assetId } : candidate,
    ),
    petProfiles: state.petProfiles.map((profile) =>
      profile.id === pet.profileId ? { ...profile, petAssetId: assetId } : profile,
    ),
  };
}

/**
 * Permanently remove a pet, its profile, and any working directory it holds.
 * Other pets' directory links are left untouched. Returns the same state
 * reference when the pet does not exist.
 */
export function removePet(state: PetsDrivenState, petId: string): PetsDrivenState {
  const target = state.pets.find((pet) => pet.id === petId);
  if (!target) {
    return state;
  }

  return {
    ...state,
    pets: state.pets.filter((pet) => pet.id !== petId),
    petProfiles: state.petProfiles.filter((profile) => profile.id !== target.profileId),
    registeredWorkingDirectories: state.registeredWorkingDirectories.filter(
      (workingDirectory) => workingDirectory.petId !== petId,
    ),
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
    registeredWorkingDirectories: state.registeredWorkingDirectories
      // A pet watches one folder, so drop any directory it used to own before
      // pointing it at the new one — otherwise the stale entry would still be
      // found first by `getWorkingDirectoryForPet` and the change wouldn't stick.
      .filter(
        (workingDirectory) =>
          workingDirectory.id === workingDirectoryId || workingDirectory.petId !== petId,
      )
      .map((workingDirectory) =>
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

/**
 * Detach a pet from its working directory — the inverse of registration.
 * Drops the directory entry the pet holds (a directory always belongs to
 * exactly one pet, so an unheld entry has no reason to linger) and clears the
 * pet's back-pointer. Returns the same state reference when the pet does not
 * exist or holds no directory.
 */
export function clearWorkingDirectoryForPet(
  state: PetsDrivenState,
  petId: string,
): PetsDrivenState {
  const pet = state.pets.find((candidate) => candidate.id === petId);
  if (!pet || pet.workingDirectoryId === null) {
    return state;
  }

  return {
    ...state,
    registeredWorkingDirectories: state.registeredWorkingDirectories.filter(
      (workingDirectory) => workingDirectory.petId !== petId,
    ),
    pets: state.pets.map((candidate) =>
      candidate.id === petId ? { ...candidate, workingDirectoryId: null } : candidate,
    ),
  };
}

export type RegisterWorkingDirectoryInput = {
  petId: string;
  path: string;
  /** Id + agent source used only when a new directory is created. */
  workingDirectoryId: string;
  agentSourceId: string;
  now: number;
};

export type RegisterWorkingDirectoryResult =
  | { status: "linked"; state: PetsDrivenState; workingDirectoryId: string }
  | { status: "occupied"; ownerPetId: string };

function comparablePath(path: string): string {
  return normalizeWorkingDirectoryPath(path).toLowerCase();
}

/**
 * Register (or reuse) a working directory for a pet — the Pet Birth moment.
 * Enforces 1 pet : 1 folder: a directory already held by a *different*
 * existing pet is reported as `occupied` instead of being stolen here.
 */
export function registerWorkingDirectory(
  state: PetsDrivenState,
  input: RegisterWorkingDirectoryInput,
): RegisterWorkingDirectoryResult {
  const normalizedPath = normalizeWorkingDirectoryPath(input.path);
  const existing = state.registeredWorkingDirectories.find(
    (workingDirectory) => comparablePath(workingDirectory.path) === comparablePath(normalizedPath),
  );

  if (existing && existing.petId !== input.petId) {
    const owner = state.pets.find((pet) => pet.id === existing.petId);

    if (owner) {
      return { status: "occupied", ownerPetId: owner.id };
    }
  }

  const workingDirectoryId = existing ? existing.id : input.workingDirectoryId;
  const withDirectory: PetsDrivenState = existing
    ? state
    : {
        ...state,
        registeredWorkingDirectories: [
          ...state.registeredWorkingDirectories,
          {
            id: workingDirectoryId,
            path: normalizedPath,
            petId: input.petId,
            agentSourceId: input.agentSourceId,
            createdAt: input.now,
            updatedAt: input.now,
          },
        ],
      };

  return {
    status: "linked",
    state: linkPetToWorkingDirectory(withDirectory, input.petId, workingDirectoryId),
    workingDirectoryId,
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
