import type { BadgeTone } from "@pets-driven/design-system";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

/** Status pill shown on a pet card: a label, a Badge tone, and a dot color. */
export type PetCardStatus = {
  label: string;
  tone: BadgeTone;
  dotColor: string;
};

const IDLE: PetCardStatus = {
  label: "Idle",
  tone: "neutral",
  dotColor: "var(--ink-300)",
};

const WORKING: PetCardStatus = {
  label: "Working",
  tone: "info",
  dotColor: "var(--sky-300)",
};

/**
 * Derive a card status from the live world snapshot. A pet with no snapshot
 * (not deployed, or no running simulation) reads as Idle. The agent hook's
 * held state — the same signal the pet window surfaces — wins when present;
 * otherwise an in-world pet reads as Working.
 */
export function petStatusFromSnapshot(
  snapshot: PetSnapshot | undefined,
): PetCardStatus {
  if (!snapshot) {
    return IDLE;
  }

  switch (snapshot.heldAgentState?.kind) {
    case "waiting":
      return {
        label: "Needs you",
        tone: "warning",
        dotColor: "var(--butter-300)",
      };
    case "failed":
      return {
        label: "Needs you",
        tone: "danger",
        dotColor: "var(--coral-400)",
      };
    case "completed":
      return { label: "Done", tone: "success", dotColor: "var(--mint-300)" };
    default:
      return WORKING;
  }
}
