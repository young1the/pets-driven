import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type {
  PetWindowCarrying,
  PetWindowGame,
  PetWindowOverlay,
} from "@/pet-window/pet-window-messages";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";

export const PET_WINDOW_FIXTURE_IDS = [
  "idle",
  "running",
  "countdown",
  "game-round",
  "jumping",
  "speech",
  "attention",
  "chatting",
  "agent-working",
  "agent-failed",
  "long-name",
  "large-scale",
  "small-scale",
  "connect-prompt",
  "connect-connected",
  "note",
  "trinket",
  "trinket-expiring",
] as const;

export type PetWindowFixtureId = (typeof PET_WINDOW_FIXTURE_IDS)[number];

export type PetWindowFixturePresentation = {
  decisionEmote: BehaviorTokenPresentation | null;
  animationState: PetAnimationState;
  activity: PetActivityKind | null;
  partnerName: string | null;
  overlay: PetWindowOverlay | null;
  /** Seeds the persistent "working" capsule in preview (real app derives it
   *  from the world snapshot). Defaults to false when omitted. */
  working?: boolean;
  /** Seeds the trinket countdown badge; the real app derives it from the
   *  pet's CarriedItem. Omitted = the pet is wearing nothing. */
  carrying?: PetWindowCarrying | null;
  /** Seeds the round pill above the pet; the real app derives it from the
   *  world's game session. Omitted = the pet is not on a course. */
  game?: PetWindowGame | null;
};

/** Seeds the terminal-binding notice pill (host/UI feedback, outside the ECS
 * presentation) so its distinct component is inspectable in the fixture preview. */
export type PetWindowConnectNoticeFixture = {
  text: string;
  /** `false` persists (the prompt); `true` fades on its own timer (the result). */
  transient: boolean;
};

export type PetWindowFixture = {
  id: PetWindowFixtureId;
  label: string;
  description: string;
  pet: PetWindowRouteParams;
  presentation: PetWindowFixturePresentation;
  scale?: number;
  connectNotice?: PetWindowConnectNoticeFixture;
  /** Seeds the pet's note, which in the real app rides the frame stream. */
  note?: string;
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
    id: "countdown",
    label: "Round countdown",
    description: "A game round about to start: the 3-2-1 rides in the connect notice's slot.",
    pet: { petId: "fixture-otto", assetId: "otto", windowIndex: 2, name: "Scout" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: null,
      game: {
        phase: "countdown",
        control: "user",
        countdown: "3️⃣",
        cleared: 0,
        lane: { offset: 0, forward: 150, back: 90 },
      },
    },
  },
  {
    id: "game-round",
    label: "Round running",
    description:
      "A round under way: the tally of what the pet has cleared, and where it stands in its lane.",
    pet: { petId: "fixture-otto", assetId: "otto", windowIndex: 2, name: "Scout" },
    presentation: {
      decisionEmote: null,
      animationState: "running-right",
      activity: "onTheMove",
      partnerName: null,
      overlay: null,
      game: {
        phase: "running",
        control: "user",
        countdown: null,
        cleared: 7,
        // Leaning forward into the oncoming course, which is where the lane's
        // extra room is and the reason it is drawn off centre.
        lane: { offset: 62, forward: 150, back: 90 },
      },
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
    description: "Social session with a partner name and a spoken line.",
    pet: { petId: "fixture-cato", assetId: "cato", windowIndex: 1, name: "Luna" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: "chatting",
      partnerName: "Scout",
      // The spoken line now flows through the single agent-channel as a
      // status-less message; the ambient "Chatting with Scout" capsule stays.
      overlay: {
        kind: "agent-channel",
        status: null,
        label: null,
        message: "Guess what?",
      },
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
  {
    id: "small-scale",
    label: "Small scale",
    description: "Pet window resized to the minimum scale.",
    pet: { petId: "fixture-fenn", assetId: "fenn", windowIndex: 1, name: "Ember" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: "onTheMove",
      partnerName: null,
      overlay: { kind: "status", label: "Away" },
    },
    scale: 0.5,
  },
  {
    id: "connect-prompt",
    label: "Connect: prompt",
    description: "Terminal-find connect prompt (persists until a pick resolves).",
    pet: { petId: "fixture-cato", assetId: "cato", windowIndex: 1, name: "Luna" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: null,
    },
    connectNotice: { text: "Click the terminal window to connect", transient: false },
  },
  {
    id: "connect-connected",
    label: "Connect: connected",
    description: "Terminal-find result notice — fades on its own timer after ~2.6s.",
    pet: { petId: "fixture-otto", assetId: "otto", windowIndex: 2, name: "Scout" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: null,
    },
    connectNotice: { text: "Connected to Windows Terminal", transient: true },
  },
  {
    id: "note",
    label: "Note",
    description: "Pet carrying a note: badge in the status row, text on hover.",
    pet: { petId: "fixture-mochi", assetId: "mochi", windowIndex: 3, name: "Nori" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: null,
    },
    note: "Ship the release notes before Friday.",
  },
  {
    id: "trinket",
    label: "Trinket: fresh",
    description: "Pet wearing collected wings, countdown badge near full.",
    pet: { petId: "fixture-bloop", assetId: "bloop", windowIndex: 1, name: "Bloop" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: null,
      carrying: { kind: "wings", remainingSeconds: 48, totalSeconds: 60 },
    },
  },
  {
    id: "trinket-expiring",
    label: "Trinket: expiring",
    description: "Same badge inside the last seconds, in its warning tone.",
    pet: { petId: "fixture-fenn", assetId: "fenn", windowIndex: 2, name: "Ember" },
    presentation: {
      decisionEmote: null,
      animationState: "idle",
      activity: null,
      partnerName: null,
      overlay: null,
      carrying: { kind: "claws", remainingSeconds: 4, totalSeconds: 60 },
    },
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
  return PET_WINDOW_FIXTURES.find((fixture) => fixture.id === fixtureId) ?? null;
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
