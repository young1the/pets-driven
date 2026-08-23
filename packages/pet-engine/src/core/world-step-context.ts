import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { QuietMode } from "@pets-driven/pet-engine/core/quiet-mode";
import type { WorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import type { MatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import type { Force } from "@pets-driven/pet-engine/features/physics/systems";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { ManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * Per-tick context passed to every system in the world step pipeline.
 * Defined here (not in create-world.ts) so feature modules can declare
 * SimulationSystem<WorldStepContext> descriptors next to their implementations.
 */
export type WorldStepContext = {
  deltaMs: number;
  components: ComponentStore;
  physics: MatterPhysicsWorld;
  events: WorldEventQueue;
  clock: ManualClock;
  random: RandomSource;
  bounds: { x?: number; y?: number; width: number; height: number };
  forceGroups: Force[][];
  /**
   * How much the pets may intrude this tick. One answer for the whole world,
   * set by the host between steps — see `core/quiet-mode.ts`.
   */
  quietMode: QuietMode;
};
