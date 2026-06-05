import type { ComponentStore } from "@/core/component-store";
import type { MatterPhysicsWorld } from "@/features/physics/matter-physics-world";
import type { Force } from "@/features/physics/systems";
import type { WorldEventQueue } from "@/features/events/world-event-queue";
import type { RandomSource } from "@/shared/random/seeded-random";
import type { ManualClock } from "@/shared/time/manual-clock";

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
};
