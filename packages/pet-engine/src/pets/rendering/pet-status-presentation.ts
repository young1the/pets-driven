import type { PetEmoteKind, PetMood } from "@pets-driven/design-system";
import type { PetSpriteOverlay } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import type { PetSpriteIntent } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-intent";
import type { AgentChannelStatus } from "@pets-driven/pet-engine/features/agent/components";

/**
 * Pure mapping from simulation-side presentation data (sprite intent +
 * host-driven overlay) to the design-system status primitives (capsule
 * mood/label + corner emote). No Tauri, no DOM — unit-testable.
 */
/**
 * Stable identifier for a status label, so a localization layer can translate
 * it without parsing the English source string. `null` means the label is
 * host-supplied free text (speech/attention overlays) that has no fixed key.
 * The values match the `petStatus.*` keys in the desktop translation bundle.
 */
export type PetStatusLabelKey =
  | "idle"
  | "working"
  | "waiting"
  | "done"
  | "failed"
  | "stuck"
  | "reviewing";

export type PetStatusPresentation = {
  mood: PetMood;
  /** Capsule label; null lets the mood's default label show. */
  label: string | null;
  /**
   * Stable key for the label, for localization. `null` when `label` is
   * host-supplied free text with no fixed key.
   */
  labelKey: PetStatusLabelKey | null;
  /** Optional agent-channel message line. */
  message: string | null;
  emote: PetEmoteKind;
  /** The capsule only shows when the host sent an overlay. */
  showCapsule: boolean;
};

type IntentPresentation = {
  mood: PetMood;
  label: string | null;
  labelKey: PetStatusLabelKey | null;
  emote: PetEmoteKind;
};

function presentationFromIntent(
  intent: PetSpriteIntent | undefined,
): IntentPresentation {
  switch (intent?.kind) {
    case "travel":
      return { mood: "working", label: null, labelKey: null, emote: "none" };
    case "working":
      return { mood: "working", label: null, labelKey: null, emote: "none" };
    case "idle":
      return { mood: "sleepy", label: "Idle", labelKey: "idle", emote: "zzz" };
    case "waving":
      return { mood: "happy", label: null, labelKey: null, emote: "sparkle" };
    case "jumping":
      return { mood: "excited", label: null, labelKey: null, emote: "sparkle" };
    case "failed":
      return {
        mood: "confused",
        label: "Stuck",
        labelKey: "stuck",
        emote: "exclaim",
      };
    case "waiting":
      return {
        mood: "confused",
        label: "Waiting",
        labelKey: "waiting",
        emote: "question",
      };
    case "review":
      return {
        mood: "thinking",
        label: "Reviewing",
        labelKey: "reviewing",
        emote: "none",
      };
    default:
      return { mood: "working", label: null, labelKey: null, emote: "none" };
  }
}

function presentationFromAgentStatus(
  status: AgentChannelStatus,
): IntentPresentation {
  switch (status) {
    case "working":
      return {
        mood: "working",
        label: "Working",
        labelKey: "working",
        emote: "none",
      };
    case "waiting":
      return {
        mood: "confused",
        label: "Waiting",
        labelKey: "waiting",
        emote: "question",
      };
    case "completed":
      return {
        mood: "happy",
        label: "Done",
        labelKey: "done",
        emote: "sparkle",
      };
    case "failed":
      return {
        mood: "confused",
        label: "Failed",
        labelKey: "failed",
        emote: "exclaim",
      };
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
      labelKey: null,
      message: null,
      emote: "exclaim",
      showCapsule: true,
    };
  }

  if (overlay.kind === "agent-channel") {
    const agentBase = presentationFromAgentStatus(overlay.status);
    return {
      ...agentBase,
      // The host's label wins for display, but the status enum gives us a
      // stable key the presentation layer can localize instead.
      label: overlay.label,
      message: overlay.message ?? null,
      showCapsule: true,
    };
  }

  // "speech" and "status" overlays carry their text into the capsule and
  // keep the intent-driven mood/emote. The text is free-form host content, so
  // there is no fixed label key.
  return {
    ...base,
    label: overlay.label,
    labelKey: null,
    message: null,
    showCapsule: true,
  };
}
