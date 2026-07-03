import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";

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

export type PetMotionKeyframe = {
  frame: number;
  x: number;
  y: number;
  animationState: PetAnimationState;
  facing?: "left" | "right";
};

export const DEMO_PETS: DemoPet[] = [
  {
    id: "cato",
    name: "Cato",
    assetId: "cato",
    note: "curious and tidy",
    role: "frontend",
    cwd: "D:/pets-driven",
    gradient: { from: "#FFE0EE", to: "#F4F1FE" },
    color: "#a189ee",
  },
  {
    id: "otto",
    name: "Otto",
    assetId: "otto",
    note: "steady reviewer",
    role: "tests",
    cwd: "D:/pets-driven/apps/desktop",
    gradient: { from: "#FFF3C7", to: "#DFF8EF" },
    color: "#fbc24a",
  },
  {
    id: "pip",
    name: "Pip",
    assetId: "pip",
    note: "fast explorer",
    role: "docs",
    cwd: "D:/pets-driven/docs",
    gradient: { from: "#DBF2FF", to: "#E9F7EF" },
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
    { frame: 720, x: 420, y: 650, animationState: "running-right", facing: "right" },
    { frame: 870, x: 780, y: 650, animationState: "running-right", facing: "right" },
    { frame: 1020, x: 960, y: 620, animationState: "waving", facing: "right" },
  ],
  otto: [
    { frame: 720, x: 1320, y: 650, animationState: "running-left", facing: "left" },
    { frame: 870, x: 1040, y: 650, animationState: "running-left", facing: "left" },
    { frame: 1020, x: 1160, y: 620, animationState: "jumping", facing: "left" },
  ],
  pip: [
    { frame: 720, x: 960, y: 460, animationState: "running-right", facing: "right" },
    { frame: 870, x: 1180, y: 390, animationState: "running-right", facing: "right" },
    { frame: 1020, x: 1480, y: 500, animationState: "review", facing: "right" },
  ],
};
