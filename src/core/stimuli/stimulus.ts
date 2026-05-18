export type Stimulus =
  | { type: "task.started"; sourceId: string; at: number; summary?: string }
  | { type: "task.waiting"; sourceId: string; at: number; summary?: string }
  | { type: "task.completed"; sourceId: string; at: number; summary?: string }
  | { type: "task.failed"; sourceId: string; at: number; summary?: string }
  | { type: "attention.requested"; sourceId: string; at: number; summary?: string };
