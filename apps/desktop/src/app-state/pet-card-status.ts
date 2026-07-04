import type { BadgeTone } from "@pets-driven/design-system";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

/** Stable key for a card status label, so the UI can localize it. */
export type PetCardStatusLabelKey = "idle" | "working" | "needsYou" | "done";

/**
 * Status pill shown on a pet card: a label, a Badge tone, and a dot color.
 * `label` is the English source; `labelKey` lets the render layer translate it.
 */
export type PetCardStatus = {
  label: string;
  labelKey: PetCardStatusLabelKey;
  tone: BadgeTone;
  dotColor: string;
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
        labelKey: "needsYou",
        tone: "warning",
        dotColor: "var(--butter-300)",
      };
    case "failed":
      return {
        label: "Needs you",
        labelKey: "needsYou",
        tone: "danger",
        dotColor: "var(--coral-400)",
      };
    case "completed":
      return {
        label: "Done",
        labelKey: "done",
        tone: "success",
        dotColor: "var(--mint-300)",
      };
    default:
      return IDLE;
  }
}
