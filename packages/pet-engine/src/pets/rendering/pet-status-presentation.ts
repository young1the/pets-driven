import type { PetEmoteKind, PetMood } from "@pets-driven/design-system";
import type { PetSpriteOverlay } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import type { PetSpriteIntent } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-intent";
import type { AgentChannelStatus } from "@pets-driven/pet-engine/features/agent/components";

/**
 * Pure mapping from simulation-side presentation data (sprite intent +
 * host-driven overlay) to the design-system status primitives (capsule
 * mood/label + corner emote). No Tauri, no DOM — unit-testable.
 */
export type PetStatusPresentation = {
  mood: PetMood;
  /** Capsule label; null lets the mood's default label show. */
  label: string | null;
  /** Optional agent-channel message line. */
  message: string | null;
  emote: PetEmoteKind;
  /** The capsule only shows when the host sent an overlay. */
  showCapsule: boolean;
};

type IntentPresentation = {
  mood: PetMood;
  label: string | null;
  emote: PetEmoteKind;
};

function presentationFromIntent(
  intent: PetSpriteIntent | undefined,
): IntentPresentation {
  switch (intent?.kind) {
    case "travel":
      return { mood: "working", label: null, emote: "none" };
    case "working":
      return { mood: "working", label: null, emote: "none" };
    case "idle":
      return { mood: "sleepy", label: null, emote: "zzz" };
    case "waving":
      return { mood: "happy", label: null, emote: "sparkle" };
    case "jumping":
      return { mood: "excited", label: null, emote: "sparkle" };
    case "failed":
      return { mood: "confused", label: "Stuck", emote: "exclaim" };
    case "waiting":
      return { mood: "confused", label: "Waiting", emote: "question" };
    case "review":
      return { mood: "thinking", label: "Reviewing", emote: "none" };
    default:
      return { mood: "working", label: null, emote: "none" };
  }
}

function presentationFromAgentStatus(
  status: AgentChannelStatus,
): IntentPresentation {
  switch (status) {
    case "working":
      return { mood: "working", label: "Working", emote: "none" };
    case "waiting":
      return { mood: "confused", label: "Waiting", emote: "question" };
    case "completed":
      return { mood: "happy", label: "Done", emote: "sparkle" };
    case "failed":
      return { mood: "confused", label: "Failed", emote: "exclaim" };
  }
}

export function presentPetStatus(
  intent: PetSpriteIntent | undefined,
  overlay: PetSpriteOverlay | null | undefined,
): PetStatusPresentation {
  const base = presentationFromIntent(intent);

  if (!overlay) {
    return { ...base, message: null, showCapsule: false };
  }

  if (overlay.kind === "attention") {
    return {
      mood: "confused",
      label: overlay.label,
      message: null,
      emote: "exclaim",
      showCapsule: true,
    };
  }

  if (overlay.kind === "agent-channel") {
    const agentBase = presentationFromAgentStatus(overlay.status);
    return {
      ...agentBase,
      label: overlay.label,
      message: overlay.message ?? null,
      showCapsule: true,
    };
  }

  // "speech" and "status" overlays carry their text into the capsule and
  // keep the intent-driven mood/emote.
  return { ...base, label: overlay.label, message: null, showCapsule: true };
}
