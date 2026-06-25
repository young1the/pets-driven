import type { PetProfile } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

/**
 * Full launch line run when a pet starts a new session. The leading token is
 * the shell/executable, so users can swap `cmd` for e.g. Git bash:
 * `"C:\\Program Files\\Git\\bin\\bash.exe" -lc "claude; exec bash"`.
 */
export const DEFAULT_SESSION_COMMAND = "cmd /k claude";

export type RegisteredWorkingDirectory = {
  id: string;
  path: string;
  petId: string;
  agentSourceId: string;
  createdAt: number;
  updatedAt: number;
};

export type PetRecord = {
  id: string;
  /** Back-pointer to the linked working directory; null until an agent is connected. */
  workingDirectoryId: string | null;
  assetId: string;
  profileId: string;
  /** User-given pet name from onboarding. */
  name: string;
  /** Adoption time in epoch ms; 0 for records migrated from v1. */
  adoptedAt: number;
  archived: boolean;
  visible: boolean;
  scale?: number;
  /** Free-form user note shown in the pet-edit screen. */
  memo?: string;
};

type PetRecordV1 = Omit<
  PetRecord,
  "workingDirectoryId" | "name" | "adoptedAt"
> & {
  workingDirectoryId: string;
};

export type PetsDrivenStateV1 = {
  schemaVersion: 1;
  registeredWorkingDirectories: RegisteredWorkingDirectory[];
  pets: PetRecordV1[];
  petProfiles: PetProfile[];
};

export type PetsDrivenStateV2 = {
  schemaVersion: 2;
  registeredWorkingDirectories: RegisteredWorkingDirectory[];
  pets: PetRecord[];
  petProfiles: PetProfile[];
  /** App-wide launch line for "Start new session". See DEFAULT_SESSION_COMMAND. */
  sessionCommand: string;
};

/** Canonical state alias — always the latest schema. */
export type PetsDrivenState = PetsDrivenStateV2;

export function createEmptyPetsDrivenState(): PetsDrivenState {
  return {
    schemaVersion: 2,
    registeredWorkingDirectories: [],
    pets: [],
    petProfiles: [],
    sessionCommand: DEFAULT_SESSION_COMMAND,
  };
}

function defaultPetNameFromAssetId(assetId: string): string {
  if (!assetId) {
    return "Pet";
  }

  return assetId.charAt(0).toUpperCase() + assetId.slice(1);
}

function migratePetsDrivenStateV1ToV2(
  candidate: Partial<PetsDrivenStateV1>,
): PetsDrivenState {
  const pets = Array.isArray(candidate.pets) ? candidate.pets : [];

  return {
    schemaVersion: 2,
    registeredWorkingDirectories: Array.isArray(
      candidate.registeredWorkingDirectories,
    )
      ? candidate.registeredWorkingDirectories
      : [],
    pets: pets.map((pet) => ({
      ...pet,
      workingDirectoryId: pet.workingDirectoryId || null,
      name: defaultPetNameFromAssetId(pet.assetId),
      adoptedAt: 0,
    })),
    petProfiles: Array.isArray(candidate.petProfiles)
      ? candidate.petProfiles
      : [],
    sessionCommand: DEFAULT_SESSION_COMMAND,
  };
}

/**
 * Recompute pet → directory back-pointers from the directory registry,
 * which is the source of truth for routing. Directories whose petId has
 * no pet record (e.g. dev fixtures) are left alone.
 */
function repairPetDirectoryLinks(state: PetsDrivenState): PetsDrivenState {
  if (state.pets.length === 0) {
    return state;
  }

  return {
    ...state,
    pets: state.pets.map((pet) => {
      const linkedDirectory = state.registeredWorkingDirectories.find(
        (workingDirectory) => workingDirectory.petId === pet.id,
      );
      const workingDirectoryId = linkedDirectory ? linkedDirectory.id : null;
      const memo = typeof pet.memo === "string" ? pet.memo : "";

      return pet.workingDirectoryId === workingDirectoryId && pet.memo === memo
        ? pet
        : { ...pet, workingDirectoryId, memo };
    }),
  };
}

export function parsePetsDrivenState(value: unknown): PetsDrivenState {
  if (!value || typeof value !== "object") {
    return createEmptyPetsDrivenState();
  }

  const candidate = value as Partial<PetsDrivenStateV1 | PetsDrivenStateV2>;

  if (candidate.schemaVersion === 1) {
    return repairPetDirectoryLinks(
      migratePetsDrivenStateV1ToV2(candidate as Partial<PetsDrivenStateV1>),
    );
  }

  if (candidate.schemaVersion !== 2) {
    return createEmptyPetsDrivenState();
  }

  const v2 = candidate as Partial<PetsDrivenStateV2>;

  return repairPetDirectoryLinks({
    schemaVersion: 2,
    registeredWorkingDirectories: Array.isArray(v2.registeredWorkingDirectories)
      ? v2.registeredWorkingDirectories
      : [],
    pets: Array.isArray(v2.pets) ? v2.pets : [],
    petProfiles: Array.isArray(v2.petProfiles) ? v2.petProfiles : [],
    sessionCommand:
      typeof v2.sessionCommand === "string" && v2.sessionCommand.trim()
        ? v2.sessionCommand
        : DEFAULT_SESSION_COMMAND,
  });
}

export function normalizeWorkingDirectoryPath(path: string): string {
  const separator = path.includes("\\") || /^[a-z]:/i.test(path) ? "\\" : "/";
  const parts = path
    .trim()
    .replace(/[\\/]+/g, separator)
    .split(separator);
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      normalizedParts.pop();
      continue;
    }

    normalizedParts.push(part);
  }

  if (normalizedParts.length === 0) {
    return "";
  }

  const [firstPart, ...restParts] = normalizedParts;
  const root = /^[a-z]:$/i.test(firstPart)
    ? firstPart.toUpperCase()
    : firstPart;

  return [root, ...restParts].join(separator);
}

function comparableWorkingDirectoryPath(path: string): string {
  return normalizeWorkingDirectoryPath(path).toLowerCase();
}

function isSameOrAncestorPath(
  ancestorPath: string,
  childPath: string,
): boolean {
  if (!ancestorPath || !childPath) {
    return false;
  }

  return (
    childPath === ancestorPath ||
    childPath.startsWith(`${ancestorPath}\\`) ||
    childPath.startsWith(`${ancestorPath}/`)
  );
}

export function resolveRegisteredWorkingDirectoryForCwd(
  state: PetsDrivenState,
  cwd: string,
): RegisteredWorkingDirectory | null {
  const normalizedCwd = comparableWorkingDirectoryPath(cwd);
  let match: RegisteredWorkingDirectory | null = null;
  let matchLength = -1;

  for (const workingDirectory of state.registeredWorkingDirectories) {
    const normalizedRegisteredPath = comparableWorkingDirectoryPath(
      workingDirectory.path,
    );

    if (
      isSameOrAncestorPath(normalizedRegisteredPath, normalizedCwd) &&
      normalizedRegisteredPath.length > matchLength
    ) {
      match = workingDirectory;
      matchLength = normalizedRegisteredPath.length;
    }
  }

  return match;
}
