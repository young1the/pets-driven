import type { AppView } from "@/app/app-navigation";
import type { MainWindowTab } from "@/app/main-window/main-window";
import { PET_WINDOW_FIXTURE_IDS } from "@/pet-window/pet-window-fixtures";
import {
  createAttentivePersonality,
  createCuriousPersonality,
  createGentlePersonality,
  createPlayfulPersonality,
  createReservedPersonality,
  createSteadyPersonality,
  type PersonalityFactory,
} from "@pets-driven/pet-engine/pets/personalities/factories";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import {
  createEmptyPetsDrivenState,
  type PetRecord,
  type PetsDrivenState,
  type RegisteredWorkingDirectory,
} from "@/app-state/pets-driven-state";

export const DESKTOP_FIXTURE_IDS = [
  "onboarding",
  "onboarding-empty",
  "home",
  "mixed",
  "crowded",
  "edit",
  "settings",
  "debug",
  "playground",
] as const;

export type DesktopFixtureId = (typeof DESKTOP_FIXTURE_IDS)[number];

export type DesktopFixture = {
  id: DesktopFixtureId;
  label: string;
  description: string;
  state: PetsDrivenState;
  view: AppView;
  tab: MainWindowTab;
  editPetId: string | null;
  petPackages: "default" | "empty";
};

type FixturePetInput = {
  id: string;
  assetId: string;
  name: string;
  personalityId: PetPersonalityId;
  personalityFactory: PersonalityFactory;
  visible?: boolean;
  archived?: boolean;
  memo?: string;
  path?: string;
  scale?: number;
};

const FIXTURE_PETS: FixturePetInput[] = [
  {
    id: "fixture-cato",
    assetId: "cato",
    name: "Luna",
    personalityId: "playful",
    personalityFactory: createPlayfulPersonality,
    memo: "Keeps the core simulation lively.",
    path: "C:\\work\\pets-driven\\packages\\pet-engine",
  },
  {
    id: "fixture-otto",
    assetId: "otto",
    name: "Scout",
    personalityId: "attentive",
    personalityFactory: createAttentivePersonality,
    memo: "Watches the desktop app.",
    path: "C:\\work\\pets-driven\\apps\\desktop",
    visible: true,
  },
  {
    id: "fixture-mochi",
    assetId: "mochi",
    name: "Nori",
    personalityId: "curious",
    personalityFactory: createCuriousPersonality,
    memo: "Not connected to a Working Directory yet.",
  },
  {
    id: "fixture-fenn",
    assetId: "fenn",
    name: "Ember",
    personalityId: "reserved",
    personalityFactory: createReservedPersonality,
    path: "C:\\work\\archived-experiment",
    archived: true,
  },
  {
    id: "fixture-bloop",
    assetId: "bloop",
    name: "Bloop",
    personalityId: "gentle",
    personalityFactory: createGentlePersonality,
    memo: "A calm companion with a larger display scale.",
    path: "C:\\work\\pets-driven\\plugins\\pets-driven",
    scale: 1.35,
    visible: true,
  },
  {
    id: "fixture-pip",
    assetId: "pip",
    name: "Pip With An Intentionally Long Display Name",
    personalityId: "steady",
    personalityFactory: createSteadyPersonality,
    memo: "Long content fixture for checking card overflow and wrapping behavior.",
    path: "C:\\work\\a-very-long-parent-directory\\a-very-long-working-directory-name",
  },
];

function createFixtureState(inputs: FixturePetInput[]): PetsDrivenState {
  const pets: PetRecord[] = inputs.map((input, index) => {
    const workingDirectoryId = input.path ? `fixture-directory-${index + 1}` : null;

    return {
      id: input.id,
      workingDirectoryId,
      assetId: input.assetId,
      profileId: `fixture-profile-${index + 1}`,
      name: input.name,
      adoptedAt: 1_700_000_000_000 + index,
      archived: input.archived ?? false,
      visible: input.visible ?? false,
      scale: input.scale,
      memo: input.memo ?? "",
    };
  });

  const registeredWorkingDirectories: RegisteredWorkingDirectory[] = inputs.flatMap(
    (input, index) => {
      if (!input.path) {
        return [];
      }

      return [
        {
          id: `fixture-directory-${index + 1}`,
          path: input.path,
          petId: input.id,
          agentSourceId: `fixture-source-${index + 1}`,
          createdAt: 1_700_000_000_000 + index,
          updatedAt: 1_700_000_000_000 + index,
        },
      ];
    },
  );

  return {
    schemaVersion: 3,
    registeredWorkingDirectories,
    pets,
    petProfiles: inputs.map((input, index) => ({
      id: `fixture-profile-${index + 1}`,
      petAssetId: input.assetId,
      personalityId: input.personalityId,
      personality: input.personalityFactory(),
    })),
    sessionCommand: "cmd /k codex",
    petSourceDirectory: "C:\\Users\\fixture\\.petdex\\pets",
  };
}

function createCrowdedFixtureState(): PetsDrivenState {
  const assets = ["cato", "otto", "mochi", "fenn", "bloop", "pip"];
  const crowdedPets = Array.from({ length: 10 }, (_, index) => ({
    ...FIXTURE_PETS[index % FIXTURE_PETS.length],
    id: `fixture-crowded-${index + 1}`,
    assetId: assets[index % assets.length],
    name: index === 9 ? "A Very Long Tenth Pet Name" : `Pet ${index + 1}`,
    path: `C:\\work\\fixture-project-${index + 1}`,
    visible: false,
    archived: false,
  }));

  return createFixtureState(crowdedPets);
}

const HOME_STATE = createFixtureState(FIXTURE_PETS.slice(0, 3));
const MIXED_STATE = createFixtureState(FIXTURE_PETS);

export const DESKTOP_FIXTURES: readonly DesktopFixture[] = [
  {
    id: "onboarding",
    label: "Onboarding",
    description: "Empty first-run state.",
    state: createEmptyPetsDrivenState(),
    view: "onboarding",
    tab: "home",
    editPetId: null,
    petPackages: "default",
  },
  {
    id: "onboarding-empty",
    label: "Onboarding without pets",
    description: "Adopt-a-pet flow with no installed Pet Assets.",
    state: createEmptyPetsDrivenState(),
    view: "adopt",
    tab: "home",
    editPetId: null,
    petPackages: "empty",
  },
  {
    id: "home",
    label: "Home",
    description: "Three adopted pets, including one deployed pet.",
    state: HOME_STATE,
    view: "home",
    tab: "home",
    editPetId: null,
    petPackages: "default",
  },
  {
    id: "mixed",
    label: "Mixed state",
    description: "At-home, deployed, unbound, scaled, and archived pets.",
    state: MIXED_STATE,
    view: "home",
    tab: "home",
    editPetId: null,
    petPackages: "default",
  },
  {
    id: "crowded",
    label: "Crowded home",
    description: "Ten cards for fan layout and overflow checks.",
    state: createCrowdedFixtureState(),
    view: "home",
    tab: "home",
    editPetId: null,
    petPackages: "default",
  },
  {
    id: "edit",
    label: "Pet details",
    description: "The first pet opened in the edit surface.",
    state: MIXED_STATE,
    view: "home",
    tab: "home",
    editPetId: "fixture-cato",
    petPackages: "default",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Settings populated with fixture launch and asset paths.",
    state: MIXED_STATE,
    view: "home",
    tab: "settings",
    editPetId: null,
    petPackages: "default",
  },
  {
    id: "debug",
    label: "Debug",
    description: "Debug controls with a populated pet roster.",
    state: MIXED_STATE,
    view: "home",
    tab: "debug",
    editPetId: null,
    petPackages: "default",
  },
  {
    id: "playground",
    label: "Playground",
    description: "Simulation playground inside the desktop shell.",
    state: MIXED_STATE,
    view: "playground",
    tab: "home",
    editPetId: null,
    petPackages: "default",
  },
];

export function resolveDesktopFixture(
  search: string,
  options: { hostname: string; isDev: boolean },
): DesktopFixture | null {
  if (!options.isDev || !isLoopbackHostname(options.hostname)) {
    return null;
  }

  const params = new URLSearchParams(search);

  if (!params.has("fixture")) {
    return null;
  }

  const fixtureId = params.get("fixture") ?? "";
  const exactMatch = DESKTOP_FIXTURES.find(
    (fixture) => fixture.id === fixtureId,
  );

  if (exactMatch) {
    return exactMatch;
  }

  // A known pet-window fixture id (e.g. `?fixture=jumping`) drives that
  // switcher instead — don't steal it. Anything else (`?fixture=true`, a
  // typo, an empty value) doesn't need to be remembered exactly: it still
  // opens the main desktop switcher, seeded with the first fixture.
  if ((PET_WINDOW_FIXTURE_IDS as readonly string[]).includes(fixtureId)) {
    return null;
  }

  return DESKTOP_FIXTURES[0];
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
