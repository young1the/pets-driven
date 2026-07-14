import type { PetMood } from "@pets-driven/design-system";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";

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

export type DemoPetStatus = {
  label: string;
  message: string | null;
  mood: PetMood;
};

export type PetMotionKeyframe = {
  frame: number;
  x: number;
  y: number;
  animationState: PetAnimationState;
  decisionEmote?: BehaviorTokenPresentation | null;
  status?: DemoPetStatus | null;
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

export const TERMINAL_LINES = [
  { prompt: "$", text: "codex --workdir D:/pets-driven", tone: "command" },
  { prompt: ">", text: "Terminal channel activated for Cato", tone: "success" },
  { prompt: ">", text: "Agent source ready in the bound working directory", tone: "muted" },
] as const;

export const MULTI_PET_PATHS: Record<string, PetMotionKeyframe[]> = {
  cato: [
    { frame: 720, x: 420, y: 650, animationState: "running-right" },
    { frame: 870, x: 780, y: 650, animationState: "running-right" },
    { frame: 1020, x: 960, y: 620, animationState: "waving" },
  ],
  otto: [
    { frame: 720, x: 1320, y: 650, animationState: "running-left" },
    { frame: 870, x: 1040, y: 650, animationState: "running-left" },
    { frame: 1020, x: 1160, y: 620, animationState: "jumping" },
  ],
  pip: [
    { frame: 720, x: 960, y: 460, animationState: "running-right" },
    { frame: 870, x: 1180, y: 390, animationState: "running-right" },
    { frame: 1020, x: 1480, y: 500, animationState: "review" },
  ],
};
