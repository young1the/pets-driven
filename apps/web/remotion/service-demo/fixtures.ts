import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { PetSpriteOverlay } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";

export type DemoPet = {
  id: string;
  name: string;
  assetId: "cato" | "otto" | "mochi" | "fenn" | "bloop" | "pip";
  note: string;
  role: string;
  cwd: string;
  gradient: { from: string; to: string };
  color: string;
};

/**
 * Deliberately the same shape as the app's `PetWindowFixturePresentation`: the
 * video states what the pet IS, and `presentPetStatus` derives every label,
 * mood and emote from it — exactly as the desktop window does. Nothing in this
 * video should hand-write a capsule string; if a label looks wrong, it is wrong
 * in the product too.
 */
export type DemoPetPresentation = {
  animationState: PetAnimationState;
  activity?: PetActivityKind | null;
  partnerName?: string | null;
  /** A running agent task keeps the capsule pinned open, as in the real window. */
  working?: boolean;
  overlay?: PetSpriteOverlay | null;
  decisionEmote?: BehaviorTokenPresentation | null;
};

export type PetMotionKeyframe = DemoPetPresentation & {
  frame: number;
  x: number;
  y: number;
};

export const DEMO_PETS: DemoPet[] = [
  {
    id: "cato",
    name: "Cato",
    assetId: "cato",
    note: "curious and tidy",
    role: "frontend",
    cwd: "D:/pets-driven",
    gradient: { from: "#5BD08A", to: "#2E9E63" },
    color: "#a189ee",
  },
  {
    id: "otto",
    name: "Otto",
    assetId: "otto",
    note: "steady reviewer",
    role: "tests",
    cwd: "D:/pets-driven/apps/desktop",
    gradient: { from: "#8B7FE8", to: "#6F5FD6" },
    color: "#fbc24a",
  },
  {
    id: "pip",
    name: "Pip",
    assetId: "pip",
    note: "fast explorer",
    role: "docs",
    cwd: "D:/pets-driven/docs",
    gradient: { from: "#FF7A5C", to: "#E04428" },
    color: "#5fb2ea",
  },
];

export const WORKSPACE_PETS: DemoPet[] = [
  {
    id: "bloop",
    name: "Bloop",
    assetId: "bloop",
    note: "playful operator",
    role: "ops",
    cwd: "D:/pets-driven/services",
    gradient: { from: "#75D9A9", to: "#46B97E" },
    color: "#75d9a9",
  },
  {
    id: "fenn",
    name: "Fenn",
    assetId: "fenn",
    note: "swift scout",
    role: "tests",
    cwd: "D:/pets-driven/apps/desktop",
    gradient: { from: "#F2A45E", to: "#DE6E2B" },
    color: "#f2a45e",
  },
  {
    id: "mochi",
    name: "Mochi",
    assetId: "mochi",
    note: "careful archivist",
    role: "docs",
    cwd: "D:/pets-driven/docs",
    gradient: { from: "#FF9DB6", to: "#F16A90" },
    color: "#ff9db6",
  },
];
