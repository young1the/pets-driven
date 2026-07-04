/**
 * The Sims-style motive/need layer. Each value is 0..1 "unmet need" pressure —
 * higher means more pressing. Values passively drift via DriveDecaySystem
 * (see ./systems.ts) and are relieved by satisfying interactions wired into
 * features/behavior/systems.ts (approach-pet-success, collision-engage,
 * wander-far / request-climb, request-jump / request-climb).
 */
export type DrivesComponent = {
  type: "Drives";
  /** Rises with time alone (loneliness); lowered by social interactions. */
  social: number;
  /** Drained by movement (walk/jump/climb); recovered while idle. */
  energy: number;
  /** Rises without new stimuli (boredom); resolved by exploration. */
  curiosity: number;
};
