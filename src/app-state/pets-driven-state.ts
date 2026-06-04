import type { PetProfile } from "@/pets/profiles/pet-profile";

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
  workingDirectoryId: string;
  assetId: string;
  profileId: string;
  archived: boolean;
  visible: boolean;
};

export type PetsDrivenStateV1 = {
  schemaVersion: 1;
  registeredWorkingDirectories: RegisteredWorkingDirectory[];
  pets: PetRecord[];
  petProfiles: PetProfile[];
};

export function createEmptyPetsDrivenState(): PetsDrivenStateV1 {
  return {
    schemaVersion: 1,
    registeredWorkingDirectories: [],
    pets: [],
    petProfiles: [],
  };
}

export function parsePetsDrivenState(value: unknown): PetsDrivenStateV1 {
  if (!value || typeof value !== "object") {
    return createEmptyPetsDrivenState();
  }

  const candidate = value as Partial<PetsDrivenStateV1>;

  if (candidate.schemaVersion !== 1) {
    return createEmptyPetsDrivenState();
  }

  return {
    schemaVersion: 1,
    registeredWorkingDirectories: Array.isArray(
      candidate.registeredWorkingDirectories,
    )
      ? candidate.registeredWorkingDirectories
      : [],
    pets: Array.isArray(candidate.pets) ? candidate.pets : [],
    petProfiles: Array.isArray(candidate.petProfiles)
      ? candidate.petProfiles
      : [],
  };
}

export function withDesktopFixtureWorkingDirectories(
  state: PetsDrivenStateV1,
): PetsDrivenStateV1 {
  if (state.registeredWorkingDirectories.length > 0) {
    return state;
  }

  // Temporary desktop fixture seed until the Management Surface can register
  // real Working Directories into persisted state.
  return {
    ...state,
    registeredWorkingDirectories: [
      {
        id: "wd-fixture-cms",
        path: "D:\\cms",
        petId: "pet-a",
        agentSourceId: "agent-a",
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "wd-fixture-pets-driven",
        path: "D:\\workmanager\\pets-driven",
        petId: "pet-a",
        agentSourceId: "agent-a",
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  };
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
  const root = /^[a-z]:$/i.test(firstPart) ? firstPart.toUpperCase() : firstPart;

  return [root, ...restParts].join(separator);
}

function comparableWorkingDirectoryPath(path: string): string {
  return normalizeWorkingDirectoryPath(path).toLowerCase();
}

function isSameOrAncestorPath(ancestorPath: string, childPath: string): boolean {
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
  state: PetsDrivenStateV1,
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
