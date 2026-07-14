import type {
  BodySnapshot,
  PetSnapshot,
  WorldSnapshot,
} from "@pets-driven/pet-engine/core/world-snapshot";

export type PetDiagnosticsTrackerOptions = {
  stallAfterMs?: number;
  stillDistancePx?: number;
  stillSpeedPxPerMs?: number;
  maxRecentSamples?: number;
};

export type PetDiagnosticSample = {
  sequence: number;
  now: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  steering: string;
  locomotion: string;
  motionTarget: { x: number; y: number } | null;
};

export type PetStallDiagnostic = {
  state: "none" | "expected-hold" | "suspected";
  stationaryForMs: number;
  reason: string;
};

export type PetDiagnosticEntry = {
  id: string;
  name: string;
  sourceId: string;
  body: BodySnapshot | null;
  pet: PetSnapshot;
  speedPxPerMs: number;
  targetDistancePx: number | null;
  signals: string[];
  stall: PetStallDiagnostic;
  recentSamples: PetDiagnosticSample[];
};

export type PetDiagnosticsSnapshot = {
  capturedAtMs: number;
  sequence: number;
  pets: PetDiagnosticEntry[];
};

export type PetDiagnosticsTracker = {
  record(input: { now: number; sequence: number; snapshot: WorldSnapshot }): PetDiagnosticsSnapshot;
  current(): PetDiagnosticsSnapshot;
};

type PetTrackerState = {
  stationarySince: number | null;
  lastSample: PetDiagnosticSample | null;
  recentSamples: PetDiagnosticSample[];
};

const DEFAULT_STALL_AFTER_MS = 2_000;
const DEFAULT_STILL_DISTANCE_PX = 0.5;
const DEFAULT_STILL_SPEED_PX_PER_MS = 0.02;
const DEFAULT_MAX_RECENT_SAMPLES = 12;

export function createPetDiagnosticsTracker(
  options: PetDiagnosticsTrackerOptions = {},
): PetDiagnosticsTracker {
  const stallAfterMs = options.stallAfterMs ?? DEFAULT_STALL_AFTER_MS;
  const stillDistancePx = options.stillDistancePx ?? DEFAULT_STILL_DISTANCE_PX;
  const stillSpeedPxPerMs = options.stillSpeedPxPerMs ?? DEFAULT_STILL_SPEED_PX_PER_MS;
  const maxRecentSamples = options.maxRecentSamples ?? DEFAULT_MAX_RECENT_SAMPLES;
  const stateByPetId = new Map<string, PetTrackerState>();
  let latest: PetDiagnosticsSnapshot = {
    capturedAtMs: 0,
    sequence: 0,
    pets: [],
  };

  return {
    record({ now, sequence, snapshot }) {
      const bodyById = new Map(snapshot.bodies.map((body) => [body.id, body]));
      const seenPetIds = new Set<string>();
      const pets = snapshot.pets.map((pet) => {
        seenPetIds.add(pet.id);
        const body = bodyById.get(pet.id) ?? null;
        const sample = sampleFromPet(sequence, now, pet, body);
        const state = stateByPetId.get(pet.id) ?? {
          stationarySince: null,
          lastSample: null,
          recentSamples: [],
        };
        const movedDistance = state.lastSample
          ? Math.hypot(sample.x - state.lastSample.x, sample.y - state.lastSample.y)
          : 0;
        const isStill =
          movedDistance <= stillDistancePx && Math.hypot(sample.vx, sample.vy) <= stillSpeedPxPerMs;

        if (!isStill) {
          state.stationarySince = now;
        } else if (state.stationarySince === null) {
          state.stationarySince = state.lastSample?.now ?? now;
        }

        state.lastSample = sample;
        state.recentSamples = [...state.recentSamples, sample].slice(-maxRecentSamples);
        stateByPetId.set(pet.id, state);

        return buildPetDiagnosticEntry({
          body,
          pet,
          recentSamples: state.recentSamples,
          speedPxPerMs: Math.hypot(sample.vx, sample.vy),
          stallAfterMs,
          stationaryForMs: state.stationarySince === null ? 0 : now - state.stationarySince,
        });
      });

      for (const petId of stateByPetId.keys()) {
        if (!seenPetIds.has(petId)) {
          stateByPetId.delete(petId);
        }
      }

      latest = {
        capturedAtMs: now,
        sequence,
        pets,
      };
      return latest;
    },
    current() {
      return latest;
    },
  };
}

function sampleFromPet(
  sequence: number,
  now: number,
  pet: PetSnapshot,
  body: BodySnapshot | null,
): PetDiagnosticSample {
  return {
    sequence,
    now,
    x: body?.x ?? pet.position.x,
    y: body?.y ?? pet.position.y,
    vx: body?.vx ?? 0,
    vy: body?.vy ?? 0,
    steering: pet.steering,
    locomotion: pet.locomotion,
    motionTarget: pet.motionTarget,
  };
}

function buildPetDiagnosticEntry(input: {
  body: BodySnapshot | null;
  pet: PetSnapshot;
  recentSamples: PetDiagnosticSample[];
  speedPxPerMs: number;
  stallAfterMs: number;
  stationaryForMs: number;
}): PetDiagnosticEntry {
  const { body, pet, recentSamples, speedPxPerMs, stallAfterMs } = input;
  const signals = diagnosticSignals(pet, body, speedPxPerMs);
  const expectedHold = signals.some((signal) =>
    ["agent-task-hold", "no-motion-target", "target-reached", "pending-reaction"].includes(signal),
  );
  const shouldMove =
    !expectedHold && (pet.steering === "pursue" || pet.steering === "arrive" || !!pet.motionTarget);
  const stationaryForMs = input.stationaryForMs;
  const stall: PetStallDiagnostic =
    shouldMove && stationaryForMs >= stallAfterMs
      ? {
          state: "suspected",
          stationaryForMs,
          reason: "Pet has movement intent or a target but position is stable.",
        }
      : expectedHold
        ? {
            state: "expected-hold",
            stationaryForMs,
            reason: "Current state explains stillness.",
          }
        : {
            state: "none",
            stationaryForMs,
            reason: "No stall detected.",
          };

  return {
    id: pet.id,
    name: pet.name,
    sourceId: pet.sourceId,
    body,
    pet,
    speedPxPerMs,
    targetDistancePx: targetDistance(pet, body),
    signals,
    stall,
    recentSamples,
  };
}

function diagnosticSignals(
  pet: PetSnapshot,
  body: BodySnapshot | null,
  speedPxPerMs: number,
): string[] {
  const signals: string[] = [];

  if (pet.motionTarget) signals.push("has-motion-target");
  else signals.push("no-motion-target");
  if (pet.steering === "pursue") signals.push("active-intent");
  if (pet.steering === "arrive") signals.push("seek-intent");
  if (pet.agentTask && pet.agentTask.status !== "working") {
    signals.push("agent-task-hold");
  }
  if (pet.pendingReaction) signals.push("pending-reaction");
  if (!pet.contact.grounded) signals.push("airborne");
  if (body?.animationState) signals.push(`animation:${body.animationState}`);
  if (speedPxPerMs <= DEFAULT_STILL_SPEED_PX_PER_MS) signals.push("low-speed");

  const distance = targetDistance(pet, body);
  if (distance !== null && distance <= 16) {
    signals.push("target-reached");
  }

  return signals;
}

function targetDistance(pet: PetSnapshot, body: BodySnapshot | null): number | null {
  if (!pet.motionTarget) return null;
  const x = body?.x ?? pet.position.x;
  const y = body?.y ?? pet.position.y;
  return Math.hypot(pet.motionTarget.x - x, pet.motionTarget.y - y);
}

export function formatPetDiagnosticsReport(input: {
  capturedAt: string;
  diagnostics: PetDiagnosticsSnapshot;
  reason: string;
  sequence: number;
  snapshot: WorldSnapshot | null;
}): string {
  const lines: string[] = [
    "Pets-Driven Pet Diagnostics",
    `capturedAt: ${input.capturedAt}`,
    `reason: ${input.reason}`,
    `hostSequence: ${input.sequence}`,
  ];

  if (!input.snapshot) {
    lines.push("", "No adopted pet simulation is running.");
    return lines.join("\n");
  }

  lines.push(
    "",
    "world:",
    `  size: ${input.snapshot.width}x${input.snapshot.height}`,
    `  viewport: ${formatJson(input.snapshot.viewport ?? null)}`,
    `  monitors: ${formatJson(input.snapshot.monitors ?? [])}`,
    "",
    "pets:",
  );

  for (const diagnostic of input.diagnostics.pets) {
    lines.push(
      `- ${diagnostic.id} (${diagnostic.name})`,
      `  sourceId: ${diagnostic.sourceId}`,
      `  STALL: ${diagnostic.stall.state}`,
      `  stallReason: ${diagnostic.stall.reason}`,
      `  stationaryForMs: ${diagnostic.stall.stationaryForMs}`,
      `  signals: ${diagnostic.signals.join(", ")}`,
      `  intent: ${diagnostic.pet.steering}`,
      `  locomotion: ${diagnostic.pet.locomotion}`,
      `  action: ${diagnostic.pet.action ?? "none"}`,
      `  agentTask: ${formatJson(diagnostic.pet.agentTask ?? null)}`,
      `  decision: ${formatJson(diagnostic.pet.decision)}`,
      `  pendingReaction: ${formatJson(diagnostic.pet.pendingReaction)}`,
      `  contact: ${formatJson(diagnostic.pet.contact)}`,
      `  motionTarget: ${formatJson(diagnostic.pet.motionTarget)}`,
      `  targetDistancePx: ${formatNumberOrNull(diagnostic.targetDistancePx)}`,
      `  body: ${formatJson(diagnostic.body)}`,
      "  recentSamples:",
      ...diagnostic.recentSamples.map(
        (sample) =>
          `    - seq=${sample.sequence} t=${sample.now} pos=(${formatNumber(sample.x)}, ${formatNumber(sample.y)}) vel=(${formatNumber(sample.vx)}, ${formatNumber(sample.vy)}) intent=${sample.steering} locomotion=${sample.locomotion} target=${formatJson(sample.motionTarget)}`,
      ),
    );
  }

  return lines.join("\n");
}

function formatJson(value: unknown): string {
  return JSON.stringify(value);
}

function formatNumberOrNull(value: number | null): string {
  return value === null ? "null" : formatNumber(value);
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}
