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
 * (not deployed, or no running simulation) reads as Idle.
 *
 * Two axes share the chip: the color/tone comes from the agent WORK status
 * (working/waiting/failed/completed/idle), and the label comes from either
 * that work state (when it needs the user) or the pet's autonomous BEHAVIOR
 * (when it is just living its life) — so the card conveys how rich the pet's
 * behavior is, not just a flat "Working". The label text is rendered in the
 * chip color, so both read as one signal.
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
    return { label: "Needs you", tone: "warning", dotColor: "var(--butter-300)" };
  }
  if (status === "failed") {
    return { label: "Needs you", tone: "danger", dotColor: "var(--coral-400)" };
  }
  if (status === "completed") {
    return { label: "Done", tone: "success", dotColor: "var(--mint-300)" };
  }

  // Working / idle: surface the pet's autonomous behavior so the card feels
  // alive. Falls back to the plain work label when nothing notable is
  // happening, preserving the base "Working" / "Idle" contract.
  const behavior = describePetBehavior(snapshot);
  if (status === "working") {
    return { label: behavior ?? WORKING.label, tone: "info", dotColor: "var(--sky-300)" };
  }
  return { label: behavior ?? IDLE.label, tone: "neutral", dotColor: "var(--ink-300)" };
}

/**
 * A short, human phrase for what the pet is autonomously doing, or null when
 * it is simply standing by. Drawn from the richest available signal: the
 * physical action, then the behavior decision, then the visual cue / intent.
 */
function describePetBehavior(snapshot: PetSnapshot): string | null {
  const action = snapshot.action;
  if (action?.startsWith("climb")) return "Climbing";
  if (action?.startsWith("jump")) return "Hopping";
  if (action === "airborne") return "Mid-air";

  switch (snapshot.decision?.reason) {
    case "seek-user":
      return "Heading over";
    case "approach-pet":
    case "collision-engage":
      return "Making friends";
    case "approach-pet-success":
      return "Found a friend";
    case "flee-from-pet":
    case "collision-flee":
    case "collision-avoid":
      return "Keeping distance";
    case "wander-near":
    case "wander-far":
    case "working-wander":
      return "Exploring";
    case "request-climb":
      return "Climbing";
    case "request-jump":
    case "collision-jump":
      return "Hopping";
  }

  switch (snapshot.visualCue?.kind) {
    case "surprised":
      return "Startled";
    case "affection":
      return "Making friends";
    case "flee":
      return "Keeping distance";
    case "wander":
      return "Exploring";
  }

  if (snapshot.intent === "seek") return "Heading over";
  if (snapshot.intent === "active") return "On the move";
  return null;
}
