// PROTOTYPE — Behavior lab.
// Interactive simulator for the priority-claim → softmax decision tree.
// Pick a personality preset and event source, then run a decision (softmax sample
// or force a specific candidate) and watch the pet act it out in the canvas.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getAtlasFrame, PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import { loadAtlasImage } from "@/pets/assets/atlas-loader";
import type { PetAnimationState, PetSpriteFacing } from "@/pets/assets/pet-atlas";
import { ProtoNav } from "./proto-design-system";

// ─── Domain types ─────────────────────────────────────────────────────────────

type EventSource    = "autonomous" | "collision" | "agent-event" | "user-interaction";
type TreePhase      = "idle" | "evaluating" | "selected";

type Personality = { O: number; C: number; E: number; A: number; N: number };

type PersonalityPreset = Personality & {
  id: string;
  name: string;
  tag: string;
};

// Exaggerated presets for prototype use. Production values in scenario-fixtures.ts
// sit in the 0.2~0.85 range, which produces only ~4x softmax ratios — visually weak.
// Pushing axes near 0.0 / 1.0 locks one or two candidates to a dominant first place
// so the personality signature is unmistakable in the candidate bars.
const PERSONALITY_PRESETS: PersonalityPreset[] = [
  { id: "sparky",  name: "Sparky",  tag: "⚡ 모험가",      O: 1.00, C: 0.20, E: 1.00, A: 0.40, N: 0.00 },
  { id: "puppy",   name: "Puppy",   tag: "🐾 집사 바라기", O: 0.30, C: 0.40, E: 1.00, A: 1.00, N: 0.00 },
  { id: "hermit",  name: "Hermit",  tag: "🏠 은둔자",       O: 0.10, C: 0.70, E: 0.00, A: 0.30, N: 0.40 },
  { id: "scaredy", name: "Scaredy", tag: "🌪️ 겁쟁이",       O: 0.00, C: 0.40, E: 0.10, A: 0.20, N: 1.00 },
  { id: "sage",    name: "Sage",    tag: "🧘 현자",         O: 0.50, C: 1.00, E: 0.30, A: 0.70, N: 0.00 },
  { id: "wildcat", name: "Wildcat", tag: "🎲 변덕쟁이",     O: 0.90, C: 0.10, E: 0.70, A: 0.50, N: 0.95 },
];

// ─── Score functions (mirrors systems.ts exactly) ─────────────────────────────

type Candidate = { kind: string; score: number; prob: number };

const BODY_W   = 32;
const BASE_R   = BODY_W * 3;
const T_BASE   = 0.25;
const ALPHA_T  = 1.2;

function softmaxTemp(N: number) { return T_BASE * (1 + ALPHA_T * N); }

function computeCandidates(p: Personality, source: EventSource): Candidate[] {
  const T   = softmaxTemp(p.N);
  const raw: Array<{ kind: string; score: number }> =
    source === "collision" ? [
      { kind: "collision-flee",    score: 0.2 + p.N * 0.7 - p.A * 0.5 },
      { kind: "collision-engage",  score: 0.2 + p.E * 0.5 + p.A * 0.5 - p.N * 0.4 },
      { kind: "collision-avoid",   score: 0.4 },
      { kind: "collision-stay",    score: 0.05 + p.A * 0.3 + (1 - p.E) + (1 - p.N) * 0.1 },
      { kind: "collision-unfazed", score: 0.15 + (1 - p.N) * 0.4 },
    ] : [
      { kind: "wander-near",   score: 0.3 + p.O * 0.1 + p.N * 0.4 },
      { kind: "wander-far",    score: 0.3 + p.O * 0.7 - p.N * 0.2 },
      { kind: "seek-user",     score: 0.3 + p.E * 0.7 + p.A * 0.3 - p.N * 0.3 },
      { kind: "request-jump",  score: 0.2 + p.E * 0.4 + p.O * 0.3 },
      { kind: "request-climb", score: 0.2 + p.O * 0.6 + p.E * 0.2 },
      { kind: "idle-stay",     score: 0.25 + (1 - p.E) * 0.3 + p.N * 0.2 },
    ];

  const maxS  = Math.max(...raw.map((c) => c.score));
  const exps  = raw.map((c) => Math.exp((c.score - maxS) / T));
  const total = exps.reduce((s, e) => s + e, 0);
  return raw
    .map((c, i) => ({ kind: c.kind, score: c.score, prob: exps[i] / total }))
    .sort((a, b) => b.prob - a.prob);
}

function sampleWinner(candidates: Candidate[], N: number): Candidate {
  const T    = softmaxTemp(N);
  const maxS = Math.max(...candidates.map((c) => c.score));
  const exps = candidates.map((c) => Math.exp((c.score - maxS) / T));
  const tot  = exps.reduce((s, e) => s + e, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < candidates.length; i++) { r -= exps[i]; if (r <= 0) return candidates[i]; }
  return candidates[candidates.length - 1];
}

// ─── Decision detail (numerical breakdown per decision kind) ──────────────────

type DetailRow = { label: string; value: string; formula?: string; highlight?: boolean };

function reactionLatency(p: Personality): number {
  return Math.max(0, Math.min(2000, Math.round(400 * (1 + p.N * 1.5 - p.E * 0.5))));
}
function movementEnergy(p: Personality): number {
  return 0.6 + p.E * 0.5 - p.N * 0.2;
}
function wanderNearRange(p: Personality): [number, number] {
  return [
    Math.round(BASE_R + p.N * BODY_W * 1.25),
    Math.round(BASE_R * 2.25 - p.N * BODY_W * 1.25),
  ];
}
function wanderFarRange(p: Personality): [number, number] {
  return [
    Math.round(BASE_R * 2 + p.O * BASE_R),
    Math.round(BASE_R * 4 + p.O * BASE_R * 2),
  ];
}

function getDecisionDetail(kind: string, p: Personality): DetailRow[] {
  const latency = reactionLatency(p);
  const energy  = movementEnergy(p).toFixed(2);

  switch (kind) {
    case "wander-near": {
      const [mn, mx] = wanderNearRange(p);
      return [
        { label: "반경 범위",   value: `${mn} ~ ${mx} px`,   formula: "96 + N×40  ~  216 − N×40",   highlight: true },
        { label: "이동 에너지", value: energy,                formula: "0.6 + E×0.5 − N×0.2" },
        { label: "클레임 유지", value: "500 ms",              formula: "CLAIM_MS[autonomous]" },
        { label: "반복 금지",   value: "750 ms",              formula: "COOLDOWN_MS[wander-near]" },
      ];
    }
    case "wander-far": {
      const [mn, mx] = wanderFarRange(p);
      const avg = Math.round((mn + mx) / 2);
      return [
        { label: "반경 최소",   value: `${mn} px`,            formula: "192 + O×96",     highlight: true },
        { label: "반경 최대",   value: `${mx} px`,            formula: "384 + O×192",    highlight: true },
        { label: "기대 반경",   value: `~${avg} px`,          formula: "(min + max) / 2" },
        { label: "이동 에너지", value: energy,                formula: "0.6 + E×0.5 − N×0.2" },
        { label: "클레임 유지", value: "500 ms",              formula: "CLAIM_MS[autonomous]" },
        { label: "반복 금지",   value: "750 ms",              formula: "COOLDOWN_MS[wander-far]" },
      ];
    }
    case "seek-user": {
      return [
        { label: "도달 반경",   value: "96 px",               formula: "USER_PROXIMITY_RADIUS" },
        { label: "이동 에너지", value: energy,                formula: "0.6 + E×0.5 − N×0.2" },
        { label: "클레임 유지", value: "500 ms" },
        { label: "반복 금지",   value: "4,000 ms",            formula: "COOLDOWN_MS[seek-user]" },
      ];
    }
    case "request-jump": {
      return [
        { label: "행동",       value: "즉시 점프" },
        { label: "클레임 유지", value: "500 ms" },
        { label: "반복 금지",   value: "2,500 ms",            formula: "COOLDOWN_MS[request-jump]" },
      ];
    }
    case "request-climb": {
      return [
        { label: "행동",       value: "벽 등반 시작" },
        { label: "클레임 유지", value: "500 ms" },
        { label: "반복 금지",   value: "6,000 ms",            formula: "COOLDOWN_MS[request-climb]" },
      ];
    }
    case "idle-stay": {
      return [
        { label: "행동",       value: "정지 (no target)" },
        { label: "클레임 유지", value: "500 ms",              formula: "CLAIM_MS[autonomous]" },
        { label: "반복 금지",   value: "1,500 ms",            formula: "COOLDOWN_MS[idle-stay]" },
      ];
    }
    case "collision-flee": {
      return [
        { label: "반응 잠복기", value: `${latency} ms`,       formula: "400×(1 + N×1.5 − E×0.5)", highlight: true },
        { label: "도주 거리",   value: `${BODY_W * 6} px`,    formula: "bodyWidth × 6" },
        { label: "클레임 유지", value: "500 ms",              formula: "CLAIM_MS[autonomous]" },
        { label: "반복 금지",   value: "750 ms",              formula: "COOLDOWN_MS[collision-flee]" },
        { label: "총 소요",     value: `~${latency + 500} ms`, formula: "잠복기 + 클레임",           highlight: true },
      ];
    }
    case "collision-engage": {
      return [
        { label: "반응 잠복기", value: `${latency} ms`,       formula: "400×(1 + N×1.5 − E×0.5)", highlight: true },
        { label: "정지 거리",   value: `${BODY_W * 2.5} px`,  formula: "bodyWidth × 2.5" },
        { label: "클레임 유지", value: "500 ms" },
        { label: "반복 금지",   value: "1,500 ms",            formula: "COOLDOWN_MS[collision-engage]" },
      ];
    }
    case "collision-avoid": {
      return [
        { label: "반응 잠복기", value: `${latency} ms`,       formula: "400×(1 + N×1.5 − E×0.5)", highlight: true },
        { label: "회피 방향",   value: "수직 이동 (sidestep)" },
        { label: "회피 거리",   value: `${BODY_W * 6} px`,    formula: "bodyWidth × 6" },
        { label: "클레임 유지", value: "500 ms" },
        { label: "반복 금지",   value: "750 ms",              formula: "COOLDOWN_MS[collision-avoid]" },
      ];
    }
    case "collision-stay": {
      const [mn, mx] = wanderFarRange(p);
      return [
        { label: "반응 잠복기", value: `${latency} ms`,       formula: "400×(1 + N×1.5 − E×0.5)", highlight: true },
        { label: "정지 유지",   value: "500 ms",              formula: "CLAIM_MS[autonomous]",      highlight: true },
        { label: "총 정지",     value: `~${latency + 500} ms`, formula: "잠복기 + 클레임",           highlight: true },
        { label: "반복 금지",   value: "1,500 ms",            formula: "COOLDOWN_MS[collision-stay]" },
        { label: "다음 후보",   value: "autonomous 재결정 →" },
        { label: "→ wander-far 반경", value: `${mn} ~ ${mx} px`, formula: "192+O×96 ~ 384+O×192" },
      ];
    }
    case "collision-unfazed": {
      const [mn, mx] = wanderNearRange(p);
      return [
        { label: "반응 잠복기", value: `${latency} ms`,       formula: "400×(1 + N×1.5 − E×0.5)", highlight: true },
        { label: "태연 후 이동", value: "wander-near (재계획)" },
        { label: "반경 범위",   value: `${mn} ~ ${mx} px`,    formula: "96+N×40 ~ 216−N×40" },
        { label: "반복 금지",   value: "500 ms",              formula: "COOLDOWN_MS[collision-unfazed]" },
      ];
    }
    default:
      return [];
  }
}

// ─── Sim canvas (pet visualization + behavior playback) ──────────────────────

const SIM_W = 480;
const SIM_H = 360;
const SIM_MARGIN = 56;
const SIM_PET_SPEED = 90; // px/sec, kept lower than real game for clearer visual
const SIM_SCALE = 0.5;
const SIM_DRAW_W = Math.round(PET_CELL_SIZE.width  * SIM_SCALE);
const SIM_DRAW_H = Math.round(PET_CELL_SIZE.height * SIM_SCALE);

// Visual radii scaled down from production wander distances so the action fits inside SIM_W.
function visualWanderNear(p: Personality): [number, number] {
  return [50 + p.N * 18, 90 + p.N * 14];
}
function visualWanderFar(p: Personality): [number, number] {
  return [110 + p.O * 30, 160 + p.O * 50];
}

const USER_ANCHOR_X = SIM_W / 2;
const USER_ANCHOR_Y = SIM_H - 30;

const OTHER_PET_X = SIM_W * 0.66;
const OTHER_PET_Y = SIM_H * 0.55;

type SimState = {
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  facing: PetSpriteFacing;
  jumpUntil: number;      // perf.now() ms — show "jumping" frames until this time
  frozenUntil: number;    // perf.now() ms — pet is paralysed (waiting/stay)
  forcedAnim: PetAnimationState | null;  // overrides idle when at rest
};

function makeInitialSim(): SimState {
  return {
    x: SIM_W / 2,
    y: SIM_H * 0.58,
    targetX: null, targetY: null,
    facing: "left",
    jumpUntil: 0,
    frozenUntil: 0,
    forcedAnim: null,
  };
}

function clampX(v: number) { return Math.max(SIM_MARGIN, Math.min(SIM_W - SIM_MARGIN, v)); }
function clampY(v: number) { return Math.max(SIM_MARGIN, Math.min(SIM_H - SIM_MARGIN, v)); }

function applyDecisionToSim(sim: SimState, kind: string, p: Personality) {
  const now = performance.now();
  sim.jumpUntil = 0;
  sim.frozenUntil = 0;
  sim.forcedAnim = null;

  switch (kind) {
    case "wander-near": {
      const [mn, mx] = visualWanderNear(p);
      const angle = Math.random() * Math.PI * 2;
      const r = mn + Math.random() * (mx - mn);
      sim.targetX = clampX(sim.x + Math.cos(angle) * r);
      sim.targetY = clampY(sim.y + Math.sin(angle) * r * 0.55);
      break;
    }
    case "wander-far": {
      const [mn, mx] = visualWanderFar(p);
      const angle = Math.random() * Math.PI * 2;
      const r = mn + Math.random() * (mx - mn);
      sim.targetX = clampX(sim.x + Math.cos(angle) * r);
      sim.targetY = clampY(sim.y + Math.sin(angle) * r * 0.55);
      break;
    }
    case "seek-user": {
      sim.targetX = USER_ANCHOR_X;
      sim.targetY = USER_ANCHOR_Y - 40;
      break;
    }
    case "request-jump": {
      sim.jumpUntil = now + 750;
      sim.targetX = null;
      sim.targetY = null;
      break;
    }
    case "request-climb": {
      sim.targetX = sim.x < SIM_W / 2 ? 80 : SIM_W - 80;
      sim.targetY = 70;
      break;
    }
    case "idle-stay": {
      sim.targetX = null;
      sim.targetY = null;
      sim.forcedAnim = "idle";
      sim.frozenUntil = now + 1500;
      break;
    }
    case "collision-flee": {
      const dx = sim.x - OTHER_PET_X;
      const dy = sim.y - OTHER_PET_Y;
      const len = Math.hypot(dx, dy) || 1;
      const dist = 170;
      sim.targetX = clampX(sim.x + (dx / len) * dist);
      sim.targetY = clampY(sim.y + (dy / len) * dist * 0.6);
      sim.frozenUntil = now + reactionLatency(p);
      break;
    }
    case "collision-engage": {
      const dx = OTHER_PET_X - sim.x;
      const len = Math.abs(dx) || 1;
      const stopOffset = (dx / len) * (BODY_W * 1.5);
      sim.targetX = clampX(OTHER_PET_X - stopOffset);
      sim.targetY = OTHER_PET_Y;
      sim.frozenUntil = now + reactionLatency(p);
      break;
    }
    case "collision-avoid": {
      const dx = sim.x - OTHER_PET_X;
      const dy = sim.y - OTHER_PET_Y;
      const len = Math.hypot(dx, dy) || 1;
      const sideX = -dy / len;
      const sideY = dx / len;
      sim.targetX = clampX(sim.x + sideX * 130);
      sim.targetY = clampY(sim.y + sideY * 130);
      sim.frozenUntil = now + reactionLatency(p);
      break;
    }
    case "collision-stay": {
      sim.targetX = null;
      sim.targetY = null;
      sim.forcedAnim = "waiting";
      sim.frozenUntil = now + reactionLatency(p) + 500;
      break;
    }
    case "collision-unfazed": {
      const angle = Math.random() * Math.PI * 2;
      sim.targetX = clampX(sim.x + Math.cos(angle) * 60);
      sim.targetY = clampY(sim.y + Math.sin(angle) * 30);
      sim.frozenUntil = now + reactionLatency(p);
      break;
    }
  }
}

function updateSim(sim: SimState, dtSec: number) {
  const now = performance.now();
  if (now < sim.frozenUntil) return;
  if (sim.targetX === null || sim.targetY === null) return;

  const dx = sim.targetX - sim.x;
  const dy = sim.targetY - sim.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2.5) {
    sim.targetX = null;
    sim.targetY = null;
    return;
  }
  if (Math.abs(dx) > 1) sim.facing = dx > 0 ? "right" : "left";
  sim.x += (dx / dist) * SIM_PET_SPEED * dtSec;
  sim.y += (dy / dist) * SIM_PET_SPEED * dtSec;
}

function currentAnim(sim: SimState): PetAnimationState {
  const now = performance.now();
  if (now < sim.jumpUntil) return "jumping";
  if (now < sim.frozenUntil && sim.forcedAnim) return sim.forcedAnim;
  if (sim.targetX !== null) return sim.facing === "right" ? "running-right" : "running-left";
  return sim.forcedAnim ?? "idle";
}

function drawSim(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement | null,
  sim: SimState,
  elapsedMs: number,
  opts: { showOther: boolean; showAnchor: boolean; otherSprite: HTMLImageElement | null },
) {
  ctx.clearRect(0, 0, SIM_W, SIM_H);

  // ground / grid background
  ctx.fillStyle = "#eef2f8";
  ctx.fillRect(0, 0, SIM_W, SIM_H);
  ctx.strokeStyle = "rgba(148,163,184,0.18)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= SIM_W; gx += 40) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, SIM_H); ctx.stroke();
  }
  for (let gy = 0; gy <= SIM_H; gy += 40) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(SIM_W, gy); ctx.stroke();
  }

  // user anchor (always shown so seek-user has a visible target)
  if (opts.showAnchor) {
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.arc(USER_ANCHOR_X, USER_ANCHOR_Y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(124,58,237,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(USER_ANCHOR_X, USER_ANCHOR_Y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#7c3aed";
    ctx.font = "10px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("user", USER_ANCHOR_X, USER_ANCHOR_Y + 26);
  }

  // target marker
  if (sim.targetX !== null && sim.targetY !== null) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sim.targetX, sim.targetY, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // line from pet to target
    ctx.strokeStyle = "rgba(22,163,74,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sim.x, sim.y);
    ctx.lineTo(sim.targetX, sim.targetY);
    ctx.stroke();
    ctx.restore();
  }

  // other pet (collision context)
  if (opts.showOther) {
    const oSprite = opts.otherSprite ?? sprite;
    const oFrame = getAtlasFrame("idle", elapsedMs + 700, "left");
    if (oSprite) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(
        oSprite,
        oFrame.sourceX, oFrame.sourceY,
        PET_CELL_SIZE.width, PET_CELL_SIZE.height,
        OTHER_PET_X - SIM_DRAW_W / 2, OTHER_PET_Y - SIM_DRAW_H / 2,
        SIM_DRAW_W, SIM_DRAW_H,
      );
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = "#fecaca";
      ctx.fillRect(OTHER_PET_X - SIM_DRAW_W / 2, OTHER_PET_Y - SIM_DRAW_H / 2, SIM_DRAW_W, SIM_DRAW_H);
    }
    ctx.fillStyle = "#dc2626";
    ctx.font = "9px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("other pet", OTHER_PET_X, OTHER_PET_Y + SIM_DRAW_H / 2 + 12);
  }

  // shadow under pet
  const grd = ctx.createRadialGradient(sim.x, sim.y + SIM_DRAW_H / 2 + 2, 2, sim.x, sim.y + SIM_DRAW_H / 2 + 2, 42);
  grd.addColorStop(0, "rgba(0,0,0,0.18)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(sim.x - 42, sim.y + SIM_DRAW_H / 2 - 4, 84, 14);

  // pet
  const anim = currentAnim(sim);
  const frame = getAtlasFrame(anim, elapsedMs, sim.facing);
  if (sprite) {
    const mirrored = sim.facing === "right" && (anim === "idle" || anim === "waving" || anim === "jumping" || anim === "failed" || anim === "waiting" || anim === "review");
    if (mirrored) {
      ctx.save();
      ctx.translate(sim.x, sim.y);
      ctx.scale(-1, 1);
      ctx.drawImage(
        sprite,
        frame.sourceX, frame.sourceY,
        PET_CELL_SIZE.width, PET_CELL_SIZE.height,
        -SIM_DRAW_W / 2, -SIM_DRAW_H / 2,
        SIM_DRAW_W, SIM_DRAW_H,
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        sprite,
        frame.sourceX, frame.sourceY,
        PET_CELL_SIZE.width, PET_CELL_SIZE.height,
        sim.x - SIM_DRAW_W / 2, sim.y - SIM_DRAW_H / 2,
        SIM_DRAW_W, SIM_DRAW_H,
      );
    }
  } else {
    ctx.fillStyle = "#dde5f0";
    ctx.fillRect(sim.x - SIM_DRAW_W / 2, sim.y - SIM_DRAW_H / 2, SIM_DRAW_W, SIM_DRAW_H);
  }

  // frozen overlay
  if (performance.now() < sim.frozenUntil && sim.targetX === null) {
    ctx.fillStyle = "rgba(245,158,11,0.85)";
    ctx.fillRect(sim.x - 22, sim.y - SIM_DRAW_H / 2 - 18, 44, 14);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FROZEN", sim.x, sim.y - SIM_DRAW_H / 2 - 8);
  }
}

// Imperative ref API exposed by SimCanvas.
export type SimCanvasHandle = {
  applyDecision(kind: string, p: Personality): void;
  reset(): void;
  hasTarget(): boolean;
};

const SimCanvas = forwardRef<SimCanvasHandle, {
  eventSource: EventSource;
  onArrived: () => void;
}>(function SimCanvas({ eventSource, onArrived }, ref) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const spriteRef  = useRef<HTMLImageElement | null>(null);
  const otherSpriteRef = useRef<HTMLImageElement | null>(null);
  const simRef     = useRef<SimState>(makeInitialSim());
  const elapsedRef = useRef(0);
  const onArrivedRef = useRef(onArrived);
  useEffect(() => { onArrivedRef.current = onArrived; }, [onArrived]);

  useImperativeHandle(ref, () => ({
    applyDecision(kind, p) { applyDecisionToSim(simRef.current, kind, p); },
    reset() { simRef.current = makeInitialSim(); },
    hasTarget() { return simRef.current.targetX !== null || performance.now() < simRef.current.frozenUntil; },
  }), []);

  // animation loop — pure ref state, no React re-render.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      elapsedRef.current += now - last;
      last = now;
      const sim = simRef.current;
      const wasBusy = sim.targetX !== null || performance.now() < sim.frozenUntil;
      updateSim(sim, dt);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        drawSim(ctx, spriteRef.current, sim, elapsedRef.current, {
          showOther: eventSource === "collision",
          showAnchor: true,
          otherSprite: otherSpriteRef.current,
        });
      }
      const stillBusy = sim.targetX !== null || performance.now() < sim.frozenUntil;
      if (wasBusy && !stillBusy) {
        onArrivedRef.current();
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [eventSource]);

  useEffect(() => {
    loadAtlasImage("/fallback-pets/patamon/spritesheet.webp")
      .then((img) => { spriteRef.current = img; otherSpriteRef.current = img; })
      .catch(() => {});
  }, []);

  return <canvas ref={canvasRef} width={SIM_W} height={SIM_H} style={{ display: "block", borderRadius: "12px", border: "1px solid #d4dde9" }} />;
});

// ─── Tree panel pieces ───────────────────────────────────────────────────────

const SOURCE_META: Record<EventSource, { label: string; priority: string; color: string }> = {
  "user-interaction": { label: "User Interaction", priority: "①", color: "#7c3aed" },
  "agent-event":      { label: "Agent Event",      priority: "②", color: "#2563eb" },
  "collision":        { label: "Collision",         priority: "③", color: "#dc2626" },
  "autonomous":       { label: "Autonomous",        priority: "④", color: "#16a34a" },
};
const ALL_SOURCES: EventSource[] = ["user-interaction", "agent-event", "collision", "autonomous"];

const OCEAN_COLORS: Record<string, string> = { O: "#8b5cf6", C: "#0ea5e9", E: "#f59e0b", A: "#22c55e", N: "#ef4444" };

function MiniOcean({ p }: { p: Personality }) {
  return (
    <div style={{ display: "grid", gap: "3px" }}>
      {(["O", "C", "E", "A", "N"] as const).map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, color: OCEAN_COLORS[k], width: 10, flexShrink: 0 }}>{k}</span>
          <div style={{ flex: 1, height: 3, background: "#f1f5f9", borderRadius: 2 }}>
            <div style={{ width: `${p[k] * 100}%`, height: "100%", background: OCEAN_COLORS[k], borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: "9px", color: "#94a3b8", width: 22, textAlign: "right", fontFamily: "monospace" }}>{p[k].toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ title, onRandom }: { title: string; onRandom: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
      <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>{title}</span>
      <button onClick={onRandom} style={{ fontSize: "11px", padding: "3px 9px", borderRadius: "5px", border: "1px solid #d4dde9", background: "#f8fafc", color: "#64748b", cursor: "pointer", fontWeight: 500 }}>자동선택</button>
    </div>
  );
}

function TreeConnector({ active }: { active?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", height: 16, margin: "2px 0" }}>
      <div style={{ width: 2, background: active ? "#2563eb" : "#d1d5db", height: "100%", position: "relative" }}>
        <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `4px solid ${active ? "#2563eb" : "#d1d5db"}` }} />
      </div>
    </div>
  );
}

function TreeNode({ label, badge, active, dim, color, children }: { label: string; badge?: string; active: boolean; dim: boolean; color: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: `2px solid ${active ? color : "#e2e8f0"}`, borderRadius: "9px", background: active ? `${color}0d` : "#fff", opacity: dim ? 0.38 : 1, transition: "all 0.22s", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 11px", borderBottom: children ? `1px solid ${active ? color + "22" : "#f1f5f9"}` : "none" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: active ? color : "#d1d5db", boxShadow: active ? `0 0 5px ${color}` : "none", animation: active && !children ? "proto-pulse 1.4s ease-in-out infinite" : "none", flexShrink: 0, transition: "all 0.22s" }} />
        <span style={{ fontSize: "11px", fontWeight: 700, color: active ? color : "#94a3b8", letterSpacing: "0.05em", textTransform: "uppercase", flex: 1 }}>{label}</span>
        {badge && <span style={{ fontSize: "10px", background: active ? color : "#e2e8f0", color: active ? "#fff" : "#94a3b8", padding: "1px 6px", borderRadius: "3px", fontWeight: 600 }}>{badge}</span>}
      </div>
      {children && <div style={{ padding: "9px 11px" }}>{children}</div>}
    </div>
  );
}

// ─── Right-side tree panel ───────────────────────────────────────────────────

function BehaviorTreePanel({ personality, presetId, onPreset, eventSource, onEventSource, winner, onDecide, onForceCandidate, treePhase, candidates }: {
  personality: Personality;
  presetId: string;
  onPreset: (p: PersonalityPreset) => void;
  eventSource: EventSource;
  onEventSource: (s: EventSource) => void;
  winner: string | null;
  onDecide: () => void;
  onForceCandidate: (kind: string) => void;
  treePhase: TreePhase;
  candidates: Candidate[];
}) {
  const src   = SOURCE_META[eventSource];
  const T     = softmaxTemp(personality.N).toFixed(2);
  const showSoftmax = eventSource === "autonomous" || eventSource === "collision";
  const detail = winner ? getDecisionDetail(winner, personality) : [];

  return (
    <div style={{ width: 340, display: "grid", gap: "12px", alignSelf: "start" }}>

      <div style={{ background: "#fff", borderRadius: "12px", padding: "14px 14px", border: "1px solid #d4dde9", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <SectionLabel title="Personality" onRandom={() => {
          const p = PERSONALITY_PRESETS[Math.floor(Math.random() * PERSONALITY_PRESETS.length)];
          onPreset(p);
        }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
          {PERSONALITY_PRESETS.map((preset) => {
            const active = presetId === preset.id;
            return (
              <button key={preset.id} onClick={() => onPreset(preset)} style={{ padding: "8px 10px", borderRadius: "8px", border: `1.5px solid ${active ? "#2563eb" : "#e2e8f0"}`, background: active ? "#eff6ff" : "#fafafa", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "5px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: active ? "#1d4ed8" : "#334155" }}>{preset.name}</span>
                  <span style={{ fontSize: "9px", color: active ? "#3b82f6" : "#94a3b8", fontWeight: 500 }}>{preset.tag}</span>
                </div>
                <MiniOcean p={preset} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", padding: "14px 14px", border: "1px solid #d4dde9", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <SectionLabel title="Event" onRandom={() => onEventSource(ALL_SOURCES[Math.floor(Math.random() * ALL_SOURCES.length)])} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          {ALL_SOURCES.map((s) => {
            const m = SOURCE_META[s];
            const active = eventSource === s;
            return (
              <button key={s} onClick={() => onEventSource(s)} style={{ padding: "7px 10px", borderRadius: "8px", border: `1.5px solid ${active ? m.color : "#d4dde9"}`, background: active ? `${m.color}12` : "#f8fafc", color: active ? m.color : "#64748b", fontSize: "11px", fontWeight: active ? 700 : 400, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                <span style={{ opacity: 0.7 }}>{m.priority} </span>{m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "12px", border: "1px solid #d4dde9" }}>
        <p style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase" }}>Behavior Tree</p>

        <TreeNode label="IDLE" active={treePhase === "idle"} dim={false} color="#64748b">
          {treePhase === "idle" && <p style={{ margin: 0, fontSize: "11px", color: "#94a3b8" }}>intent = idle · 입력 대기</p>}
        </TreeNode>

        <TreeConnector active={treePhase !== "idle"} />

        <TreeNode label="Priority Gate" active={treePhase !== "idle"} dim={false} color="#475569">
          <div style={{ display: "grid", gap: "4px" }}>
            {ALL_SOURCES.map((s) => {
              const m = SOURCE_META[s];
              const isActive = s === eventSource;
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "4px 7px", borderRadius: "5px", background: isActive ? `${m.color}12` : "transparent", border: `1px solid ${isActive ? m.color + "38" : "transparent"}`, transition: "all 0.2s" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? m.color : "#d1d5db", flexShrink: 0, boxShadow: isActive ? `0 0 4px ${m.color}` : "none" }} />
                  <span style={{ fontSize: "11px", color: isActive ? m.color : "#b0bec5", fontWeight: isActive ? 600 : 400, flex: 1 }}>{m.priority} {m.label}</span>
                  <span style={{ fontSize: "9px", color: isActive ? m.color : "#d1d5db", fontWeight: 600 }}>{isActive ? "▶ ACTIVE" : "차단"}</span>
                </div>
              );
            })}
          </div>
        </TreeNode>

        <TreeConnector active={treePhase !== "idle" && showSoftmax} />

        {showSoftmax ? (
          <TreeNode
            label={eventSource === "collision" ? "Collision Response" : "Autonomous Candidates"}
            badge={`T = ${T}`}
            active={treePhase === "evaluating" || treePhase === "selected"}
            dim={treePhase === "idle"}
            color="#7c3aed"
          >
            <div style={{ display: "grid", gap: "4px" }}>
              {candidates.map((c) => {
                const isWinner = c.kind === winner;
                const pct      = Math.round(c.prob * 100);
                return (
                  <button
                    key={c.kind}
                    onClick={() => onForceCandidate(c.kind)}
                    title="클릭으로 강제 실행"
                    style={{ display: "block", width: "100%", padding: "5px 7px", borderRadius: "6px", background: isWinner ? "#f0fdf4" : "transparent", border: `1px solid ${isWinner ? "#22c55e40" : "transparent"}`, transition: "all 0.28s", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      if (!isWinner) el.style.background = "#f1f5f9";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      if (!isWinner) el.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
                      <span style={{ fontSize: "10px", fontFamily: "monospace", color: isWinner ? "#16a34a" : "#475569", fontWeight: isWinner ? 700 : 400, flex: 1 }}>{c.kind}</span>
                      {isWinner && <span style={{ fontSize: "9px", background: "#16a34a", color: "#fff", padding: "1px 5px", borderRadius: "3px", fontWeight: 700 }}>WIN</span>}
                      <span style={{ fontSize: "10px", color: isWinner ? "#16a34a" : "#94a3b8", fontWeight: 600, minWidth: 26, textAlign: "right" }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: isWinner ? "#22c55e" : "#a5b4fc", borderRadius: 2, transition: "width 0.32s ease" }} />
                    </div>
                  </button>
                );
              })}
              <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#94a3b8", textAlign: "right" }}>
                후보 클릭 → 강제 실행 · T = {T} · N = {personality.N.toFixed(1)}
              </p>
            </div>
          </TreeNode>
        ) : (
          <TreeNode label={eventSource === "user-interaction" ? "User Direct Control" : "Agent Event Handler"} active={treePhase !== "idle"} dim={treePhase === "idle"} color={src.color}>
            <p style={{ margin: 0, fontSize: "11px", color: "#64748b", lineHeight: 1.55 }}>
              {eventSource === "user-interaction"
                ? "Softmax 없음 — 사용자가 직접 제어합니다."
                : "이벤트 종류별 결정적(deterministic) 처리.\ntask.started → active / task.waiting → hold\ntask.failed / completed → badge"}
            </p>
          </TreeNode>
        )}

        {treePhase === "selected" && winner && (
          <>
            <TreeConnector active />
            <TreeNode label="Selected" badge={winner} active dim={false} color="#16a34a">
              <p style={{ margin: 0, fontSize: "11px", color: "#16a34a" }}>BehaviorPlanningSystem 실행 →</p>
            </TreeNode>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 6px 2px" }}>
          <div style={{ flex: 1, height: 1, background: "#d1d5db" }} />
          <span style={{ fontSize: "10px", color: "#94a3b8" }}>도착 → IDLE ↩</span>
          <div style={{ flex: 1, height: 1, background: "#d1d5db" }} />
        </div>
      </div>

      {detail.length > 0 && winner && (
        <div style={{ background: "#fff", borderRadius: "12px", padding: "14px", border: "1px solid #d4dde9", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <p style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Decision Detail — <span style={{ color: "#7c3aed", fontFamily: "monospace" }}>{winner}</span>
          </p>
          <div style={{ display: "grid", gap: "6px" }}>
            {detail.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", padding: "5px 8px", borderRadius: "6px", background: row.highlight ? "#fefce8" : "#f8fafc", border: `1px solid ${row.highlight ? "#fde68a" : "#f1f5f9"}` }}>
                <div>
                  <div style={{ fontSize: "11px", color: "#475569", fontWeight: 500 }}>{row.label}</div>
                  {row.formula && <div style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace", marginTop: "1px" }}>{row.formula}</div>}
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: row.highlight ? "#92400e" : "#1e293b", fontFamily: "monospace", alignSelf: "center", whiteSpace: "nowrap" }}>
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onDecide} disabled={treePhase === "evaluating"} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "none", background: treePhase === "evaluating" ? "#e2e8f0" : treePhase === "selected" ? "#f0fdf4" : "#1e293b", color: treePhase === "evaluating" ? "#94a3b8" : treePhase === "selected" ? "#16a34a" : "#fff", fontSize: "14px", fontWeight: 700, cursor: treePhase === "evaluating" ? "default" : "pointer", transition: "all 0.2s", letterSpacing: "0.02em" }}>
        {treePhase === "idle" ? "▶  Softmax 결정" : treePhase === "evaluating" ? "⟳  평가 중..." : "↺  다시 실행"}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProtoBehaviorLab() {
  const [selectedPreset, setSelectedPreset] = useState<PersonalityPreset>(PERSONALITY_PRESETS[0]);
  const [eventSource,    setEventSource]    = useState<EventSource>("autonomous");
  const [treePhase,      setTreePhase]      = useState<TreePhase>("idle");
  const [winner,         setWinner]         = useState<string | null>(null);

  const simRef = useRef<SimCanvasHandle>(null);
  const personality = selectedPreset as Personality;
  const candidates  = computeCandidates(personality, eventSource);

  function handlePreset(p: PersonalityPreset) {
    setSelectedPreset(p);
    setTreePhase("idle");
    setWinner(null);
    simRef.current?.reset();
  }
  function handleEventSource(s: EventSource) {
    setEventSource(s);
    setTreePhase("idle");
    setWinner(null);
  }

  // Softmax sample → apply the winning decision to the pet.
  function handleDecide() {
    if (treePhase === "evaluating") return;
    setTreePhase("evaluating");
    const showSoftmax = eventSource === "autonomous" || eventSource === "collision";
    window.setTimeout(() => {
      let kind: string | null = null;
      if (showSoftmax) {
        kind = sampleWinner(candidates, personality.N).kind;
        setWinner(kind);
        simRef.current?.applyDecision(kind, personality);
      } else {
        setWinner(null);
      }
      setTreePhase("selected");
    }, showSoftmax ? 700 : 350);
  }

  // Click a candidate row → bypass softmax, force that decision on the pet.
  function handleForceCandidate(kind: string) {
    setWinner(kind);
    setTreePhase("selected");
    simRef.current?.applyDecision(kind, personality);
  }

  // Pet finished its target / latency → tree returns to IDLE so the user can pick again.
  const handleArrived = useCallback(() => {
    setTreePhase("idle");
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "20px 24px 60px", minHeight: "100vh", background: "#dce4f0", boxSizing: "border-box" }}>
      <ProtoNav active="behavior" />

      <div style={{ display: "flex", gap: "20px", alignItems: "start", flexWrap: "wrap", justifyContent: "center" }}>

        {/* Left: simulation canvas + state card */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignSelf: "start" }}>
          <SimCanvas ref={simRef} eventSource={eventSource} onArrived={handleArrived} />

          <div style={{ background: "#fff", borderRadius: "12px", padding: "12px 14px", border: "1px solid #d4dde9", width: SIM_W, boxSizing: "border-box" }}>
            <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              현재 상태
            </p>
            <div style={{ display: "grid", gap: "5px", fontSize: "11px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Personality</span>
                <span style={{ fontFamily: "monospace", color: "#1e293b" }}>{selectedPreset.name} · {selectedPreset.tag}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Event Source</span>
                <span style={{ fontFamily: "monospace", color: "#1e293b" }}>{SOURCE_META[eventSource].label}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Phase</span>
                <span style={{ fontFamily: "monospace", color: treePhase === "idle" ? "#94a3b8" : treePhase === "evaluating" ? "#f59e0b" : "#16a34a", fontWeight: 600 }}>{treePhase}</span>
              </div>
              {winner && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Decision</span>
                  <span style={{ fontFamily: "monospace", color: "#16a34a", fontWeight: 700 }}>{winner}</span>
                </div>
              )}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "10px", color: "#94a3b8", lineHeight: 1.5 }}>
              우측 트리의 후보를 클릭하면 펫이 즉시 그 행동을 수행합니다.
              <br />목표 도달 시 자동으로 IDLE로 복귀해 다음 결정을 받을 수 있습니다.
            </p>
          </div>
        </div>

        {/* Right: tree + controls */}
        <BehaviorTreePanel
          personality={personality}
          presetId={selectedPreset.id}
          onPreset={handlePreset}
          eventSource={eventSource}
          onEventSource={handleEventSource}
          winner={winner}
          onDecide={handleDecide}
          onForceCandidate={handleForceCandidate}
          treePhase={treePhase}
          candidates={candidates}
        />
      </div>
    </div>
  );
}
