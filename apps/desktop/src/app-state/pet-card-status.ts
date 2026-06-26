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
 * (not deployed, or no running simulation) reads as Idle. The agentTask status
 * drives the card: working→Working, waiting/failed→Needs you, completed→Done.
 * A deployed pet with no agentTask reads as Idle (not Working).
 */
export function petStatusFromSnapshot(
  snapshot: PetSnapshot | undefined,
): PetCardStatus {
  if (!snapshot) {
    return IDLE;
  }

  switch (snapshot.agentTask?.status) {
    case "working":
      return WORKING;
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
      return IDLE;
  }
}
