import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { PetWindowOverlay } from "@/pet-window/pet-window-messages";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";

export const PET_WINDOW_FIXTURE_IDS = [
  "idle",
  "running",
  "jumping",
  "speech",
  "attention",
  "chatting",
  "agent-working",
  "agent-failed",
  "long-name",
  "large-scale",
] as const;

export type PetWindowFixtureId = (typeof PET_WINDOW_FIXTURE_IDS)[number];

export type PetWindowFixturePresentation = {
  decisionEmote: BehaviorTokenPresentation | null;
  animationState: PetAnimationState;
  activity: PetActivityKind | null;
  partnerName: string | null;
  overlay: PetWindowOverlay | null;
};

export type PetWindowFixture = {
  id: PetWindowFixtureId;
  label: string;
  description: string;
  pet: PetWindowRouteParams;
  presentation: PetWindowFixturePresentation;
  scale?: number;
};

export const PET_WINDOW_FIXTURES: readonly PetWindowFixture[] = [
  {
    id: "idle",
    label: "Idle",
    description: "Default resting pose, no overlay.",
    pet: { petId: "fixture-cato", assetId: "cato", windowIndex: 1, name: "Luna" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: null,
    },
  },
  {
    id: "running",
    label: "Running",
    description: "Locomotion sprite row mid-stride.",
    pet: { petId: "fixture-otto", assetId: "otto", windowIndex: 2, name: "Scout" },
    presentation: {
      decisionEmote: null,
      animationState: "running-right",
      activity: "onTheMove",
      partnerName: null,
      overlay: null,
    },
  },
  {
    id: "jumping",
    label: "Jumping",
    description: "Mid-air pose with a status overlay badge.",
    pet: { petId: "fixture-mochi", assetId: "mochi", windowIndex: 3, name: "Nori" },
    presentation: {
      decisionEmote: null,
      animationState: "jumping",
      activity: "midAir",
      partnerName: null,
      overlay: { kind: "status", label: "!" },
    },
  },
  {
    id: "speech",
    label: "Speech bubble",
    description: "Idle pose with a free-text speech overlay.",
    pet: { petId: "fixture-bloop", assetId: "bloop", windowIndex: 1, name: "Bloop" },
    presentation: {
      decisionEmote: null,
      animationState: "waving",
      activity: "greeting",
      partnerName: null,
      overlay: { kind: "speech", label: "Hi there!" },
    },
  },
  {
    id: "attention",
    label: "Attention",
    description: "Attention overlay drawing the eye to the pet.",
    pet: { petId: "fixture-fenn", assetId: "fenn", windowIndex: 2, name: "Ember" },
    presentation: {
      decisionEmote: null,
      animationState: "waiting",
      activity: "observing",
      partnerName: null,
      overlay: { kind: "attention", label: "!" },
    },
  },
  {
    id: "chatting",
    label: "Chatting",
    description: "Social session with a partner name in the status card.",
    pet: { petId: "fixture-cato", assetId: "cato", windowIndex: 1, name: "Luna" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: "chatting",
      partnerName: "Scout",
      overlay: null,
    },
  },
  {
    id: "agent-working",
    label: "Agent: working",
    description: "Agent-channel overlay in the working state.",
    pet: { petId: "fixture-otto", assetId: "otto", windowIndex: 2, name: "Scout" },
    presentation: {
      decisionEmote: null,
      animationState: "review",
      activity: null,
      partnerName: null,
      overlay: {
        kind: "agent-channel",
        status: "working",
        label: "Running tests",
        message: "pnpm test --filter pets-driven",
      },
    },
  },
  {
    id: "agent-failed",
    label: "Agent: failed",
    description: "Agent-channel overlay in the failed state.",
    pet: { petId: "fixture-mochi", assetId: "mochi", windowIndex: 3, name: "Nori" },
    presentation: {
      decisionEmote: null,
      animationState: "failed",
      activity: null,
      partnerName: null,
      overlay: {
        kind: "agent-channel",
        status: "failed",
        label: "Build failed",
        message: "TS2322: Type mismatch in pet-window-view.tsx",
      },
    },
  },
  {
    id: "long-name",
    label: "Long name",
    description: "Long display name for status-card overflow checks.",
    pet: {
      petId: "fixture-pip",
      assetId: "pip",
      windowIndex: 1,
      name: "Pip With An Intentionally Long Display Name",
    },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: { kind: "status", label: "!" },
    },
  },
  {
    id: "large-scale",
    label: "Large scale",
    description: "Pet window resized above the default scale.",
    pet: { petId: "fixture-bloop", assetId: "bloop", windowIndex: 2, name: "Bloop" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: null,
    },
    scale: 1.35,
  },
];

export function resolvePetWindowFixture(
  search: string,
  options: { hostname: string; isDev: boolean },
): PetWindowFixture | null {
  if (!options.isDev || !isLoopbackHostname(options.hostname)) {
    return null;
  }

  const fixtureId = new URLSearchParams(search).get("fixture");

  // Only an exact pet-window fixture id opens this switcher. An unmatched
  // `?fixture=` value defaults to the main desktop switcher instead — see
  // `resolveDesktopFixture` in dev-fixtures.ts.
  return (
    PET_WINDOW_FIXTURES.find((fixture) => fixture.id === fixtureId) ?? null
  );
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
