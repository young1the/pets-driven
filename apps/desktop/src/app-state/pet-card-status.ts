import type { BadgeTone } from "@pets-driven/design-system";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";

/**
 * Labels for a pet living its life autonomously (the "behavior" axis). These
 * are exactly the engine's canonical activity keys (core/pet-activity.ts), so
 * no mapping layer sits between the simulation and the chip.
 */
export type PetBehaviorLabelKey = PetActivityKind;

/**
 * Partner-aware variants of the social activity labels: when the pet is in a
 * live session, the chip names its partner ("Chatting with Otto").
 */
export type PetCardSocialLabelKey =
  | "chattingWith"
  | "playingWith"
  | "makingFriendsWith";

/** Stable key for a card status label, so the UI can localize it. */
export type PetCardStatusLabelKey =
  | "idle"
  | "working"
  | "needsYou"
  | "done"
  | PetBehaviorLabelKey
  | PetCardSocialLabelKey;

/**
 * Status pill shown on a pet card: a label, a Badge tone, and a dot color.
 * `label` is the English source; `labelKey` lets the render layer translate it.
 * `labelParams` carries interpolation values (the partner name) for the
 * partner-aware social labels.
 */
export type PetCardStatus = {
  label: string;
  labelKey: PetCardStatusLabelKey;
  labelParams?: { name: string };
  tone: BadgeTone;
  dotColor: string;
};

/** Which social activities get a partner-aware "…with <name>" label. */
const SOCIAL_WITH_LABEL: Partial<
  Record<PetBehaviorLabelKey, { key: PetCardSocialLabelKey; label: string }>
> = {
  chatting: { key: "chattingWith", label: "Chatting with" },
  playing: { key: "playingWith", label: "Playing with" },
  makingFriends: { key: "makingFriendsWith", label: "Making friends with" },
};

/**
 * The behavior label for a pet, partner-aware when it is in a live social
 * session. Returns null when the pet has no notable autonomous activity.
 */
function behaviorLabel(snapshot: PetSnapshot): {
  label: string;
  labelKey: PetCardStatusLabelKey;
  labelParams?: { name: string };
} | null {
  const behaviorKey = snapshot.activity ?? null;
  if (!behaviorKey) return null;

  const partnerName = snapshot.social?.partnerName ?? null;
  const withVariant = SOCIAL_WITH_LABEL[behaviorKey];
  if (partnerName && withVariant) {
    return {
      label: `${withVariant.label} ${partnerName}`,
      labelKey: withVariant.key,
      labelParams: { name: partnerName },
    };
  }
  return { label: BEHAVIOR_LABEL[behaviorKey], labelKey: behaviorKey };
}

/** English source strings for the autonomous-behavior labels. */
const BEHAVIOR_LABEL: Record<PetBehaviorLabelKey, string> = {
  exploring: "Exploring",
  climbing: "Climbing",
  hopping: "Hopping",
  midAir: "Mid-air",
  headingOver: "Heading over",
  makingFriends: "Making friends",
  foundAFriend: "Found a friend",
  keepingDistance: "Keeping distance",
  startled: "Startled",
  chasingCursor: "Chasing the cursor",
  caughtCursor: "Caught it!",
  beingPetted: "Being petted",
  chatting: "Chatting",
  playing: "Playing",
  onTheMove: "On the move",
  greeting: "Hi there!",
  grooming: "Tidying up",
  observing: "Looking around",
  beckoning: "Come here!",
  fretting: "Worried",
};

const IDLE: PetCardStatus = {
  label: "Idle",
  labelKey: "idle",
  tone: "neutral",
  dotColor: "var(--ink-300)",
};

const WORKING: PetCardStatus = {
  label: "Working",
  labelKey: "working",
  tone: "info",
  dotColor: "var(--sky-300)",
};

/**
 * Derive a card status from the live world snapshot. A pet with no snapshot
 * (not deployed, or no running simulation) reads as Idle.
 *
 * Two axes share the chip: the color/tone comes from the agent WORK status
 * (working/waiting/failed/completed/idle), and the label comes from either
 * that work state (when it needs the user) or the pet's autonomous BEHAVIOR
 * (when it is just living its life) — so the card conveys how rich the pet's
 * behavior is, not just a flat "Working". The label text is rendered in the
 * chip color, so both read as one signal, and localizes via labelKey.
 *
 * The behavior label is the engine's canonical `snapshot.activity`, derived
 * with claim-expiry checks in the simulation — this layer no longer guesses
 * from decision/action/intent fields.
 */
export function petStatusFromSnapshot(
  snapshot: PetSnapshot | undefined,
): PetCardStatus {
  if (!snapshot) {
    return IDLE;
  }

  const status = snapshot.agentTask?.status;

  // Actionable work states own the label — they need the user, so the ambient
  // behavior takes a back seat.
  if (status === "waiting") {
    return {
      label: "Needs you",
      labelKey: "needsYou",
      tone: "warning",
      dotColor: "var(--butter-300)",
    };
  }
  if (status === "failed") {
    return {
      label: "Needs you",
      labelKey: "needsYou",
      tone: "danger",
      dotColor: "var(--coral-400)",
    };
  }
  if (status === "completed") {
    return {
      label: "Done",
      labelKey: "done",
      tone: "success",
      dotColor: "var(--mint-300)",
    };
  }

  // Working / idle: surface the pet's autonomous behavior so the card feels
  // alive. Falls back to the plain work label when nothing notable is
  // happening, preserving the base "Working" / "Idle" contract.
  const behavior = behaviorLabel(snapshot);
  if (status === "working") {
    return {
      label: behavior?.label ?? WORKING.label,
      labelKey: behavior?.labelKey ?? "working",
      labelParams: behavior?.labelParams,
      tone: "info",
      dotColor: "var(--sky-300)",
    };
  }
  return {
    label: behavior?.label ?? IDLE.label,
    labelKey: behavior?.labelKey ?? "idle",
    labelParams: behavior?.labelParams,
    tone: "neutral",
    dotColor: "var(--ink-300)",
  };
}

/**
 * Autonomous decisions can churn every 500ms–2s, which makes the raw
 * per-tick status unreadable ("Exploring → Idle → Hopping" flicker). The
 * tracker adds display hysteresis per pet:
 *
 *  • tone changes (agent work state) switch immediately — never delay
 *    "Needs you" / "Done";
 *  • a base label (Idle/Working) upgrading to a behavior label switches
 *    immediately — reactions should feel instant;
 *  • behavior→behavior and behavior→base changes hold the previous label
 *    until it has been visible for `minDisplayMs`.
 */
const DEFAULT_MIN_DISPLAY_MS = 1_500;

const BASE_LABEL_KEYS: ReadonlySet<PetCardStatusLabelKey> = new Set([
  "idle",
  "working",
  "needsYou",
  "done",
]);

export function createPetCardStatusTracker(
  minDisplayMs: number = DEFAULT_MIN_DISPLAY_MS,
) {
  const shown = new Map<string, { status: PetCardStatus; shownAt: number }>();

  return {
    track(petId: string, next: PetCardStatus, now: number): PetCardStatus {
      const current = shown.get(petId);
      if (!current) {
        shown.set(petId, { status: next, shownAt: now });
        return next;
      }

      const toneChanged = current.status.tone !== next.tone;
      const labelChanged = current.status.labelKey !== next.labelKey;
      if (!labelChanged && !toneChanged) {
        return current.status;
      }

      const upgradeFromBase =
        BASE_LABEL_KEYS.has(current.status.labelKey) &&
        !BASE_LABEL_KEYS.has(next.labelKey);
      const heldLongEnough = now - current.shownAt >= minDisplayMs;

      if (toneChanged || upgradeFromBase || heldLongEnough) {
        shown.set(petId, { status: next, shownAt: now });
        return next;
      }

      return current.status;
    },
    forget(petId: string): void {
      shown.delete(petId);
    },
  };
}

export type PetCardStatusTracker = ReturnType<
  typeof createPetCardStatusTracker
>;
