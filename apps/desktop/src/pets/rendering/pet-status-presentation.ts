import type { PetEmoteKind, PetMood } from "@pets-driven/design-system";
import type { PetSpriteOverlay } from "@/pets/rendering/pet-sprite";
import type { PetSpriteIntent } from "@/pets/rendering/pet-sprite-intent";

/**
 * Pure mapping from simulation-side presentation data (sprite intent +
 * host-driven overlay) to the design-system status primitives (capsule
 * mood/label + corner emote). No Tauri, no DOM — unit-testable.
 */
export type PetStatusPresentation = {
  mood: PetMood;
  /** Capsule label; null lets the mood's default label show. */
  label: string | null;
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
      return { mood: "working", label: "Moving", emote: "none" };
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

export function presentPetStatus(
  intent: PetSpriteIntent | undefined,
  overlay: PetSpriteOverlay | null | undefined,
): PetStatusPresentation {
  const base = presentationFromIntent(intent);

  if (!overlay) {
    return { ...base, showCapsule: false };
  }

  if (overlay.kind === "attention") {
    return {
      mood: "confused",
      label: overlay.label,
      emote: "exclaim",
      showCapsule: true,
    };
  }

  // "speech" and "status" overlays carry their text into the capsule and
  // keep the intent-driven mood/emote.
  return { ...base, label: overlay.label, showCapsule: true };
}
