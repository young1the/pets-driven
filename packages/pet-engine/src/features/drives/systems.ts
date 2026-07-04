import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";

export function clampDrive(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Nonlinear utility-response curve (Dave Mark's Infinite Axis Utility style).
 * Cubic growth keeps low/mid drive pressure from meaningfully swaying a
 * decision, while values above roughly 0.7-0.8 shoot toward 1 — so crossing
 * that threshold visibly changes behavior instead of nudging scores along a
 * straight line. Score functions in features/behavior/systems.ts multiply this
 * by a fixed weight per drive/behavior pairing.
 */
export function driveResponseCurve(x: number): number {
  const c = clampDrive(x);
  return c * c * c;
}

// Rates are picked so the rhythm this system is meant to produce — an
// increasingly lonely pet seeking company, a tired pet resting, a bored pet
// exploring — is visible within a single demo session (a few minutes) without
// dominating every tick.
const SOCIAL_RISE_PER_MS = 1 / (3 * 60 * 1000); // 0 -> 1 lonely over ~3 min alone
const ENERGY_DRAIN_PER_MS = 1 / (2 * 60 * 1000); // 1 -> 0 over ~2 min of continuous activity
const ENERGY_RECOVERY_PER_MS = 1 / (1 * 60 * 1000); // 0 -> 1 over ~1 min idle (rest beats exertion)
const CURIOSITY_RISE_PER_MS = 1 / (2.5 * 60 * 1000); // 0 -> 1 over ~2.5 min without new stimuli

/**
 * Pure per-tick drive drift. Social loneliness always rises; energy drains
 * while the pet is pursuing a goal (MotionTarget/IntentState "active"/"seek")
 * and recovers while idle; curiosity rises only while idle (no new stimuli).
 * Satisfaction hooks (approach-pet-success, collision-engage, wander-far,
 * request-jump/climb) live next to their triggers in behavior/systems.ts.
 */
export function runDriveDecaySystem(
  components: ComponentStore,
  deltaMs: number,
): void {
  components.forEach(["Drives", "IntentState"], (_id, [drives, intent]) => {
    const isPursuingGoal = intent.intent === "active" || intent.intent === "seek";

    drives.social = clampDrive(drives.social + SOCIAL_RISE_PER_MS * deltaMs);

    drives.energy = clampDrive(
      drives.energy +
        (isPursuingGoal ? -ENERGY_DRAIN_PER_MS : ENERGY_RECOVERY_PER_MS) *
          deltaMs,
    );

    if (!isPursuingGoal) {
      drives.curiosity = clampDrive(
        drives.curiosity + CURIOSITY_RISE_PER_MS * deltaMs,
      );
    }
  });
}

// ── System descriptor ──────────────────────────────────────────────────────

export const DriveDecaySystem: SimulationSystem<WorldStepContext> = {
  name: "DriveDecaySystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["Drives", "IntentState"],
  writes: ["Drives"],
  update(ctx) {
    runDriveDecaySystem(ctx.components, ctx.deltaMs);
  },
};
