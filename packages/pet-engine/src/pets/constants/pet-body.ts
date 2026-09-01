export const DEFAULT_PET_BODY_SIZE = {
  width: 32,
  height: 38,
} as const;

export const DEFAULT_PET_WALK_FORCE = 0.01;
// Velocity KeyboardControlMovementSystem pins on a steered pet, in engine
// pixels per 16ms tick. Direct control has to out-walk the pet, and the
// measured band is narrow: a walker travels ~2.1px a tick almost exactly and
// only a hurried one reaches ~3.9 (see the prop-kick note in AGENTS.md). At
// the original 1.4 a steered pet was slower than the same pet strolling on its
// own, which is what made driving it feel like wading. 3.2 sits between a walk
// and a hurry — unmistakably the user's hand — and stays far below the 48px
// wall thickness a single tick must not clear (see MAX_THROW_SPEED).
export const DEFAULT_PET_CONTROL_SPEED = 3.2;

// Tuned so the default pet jumps above its own body height under Matter.js gravity.
export const DEFAULT_PET_JUMP_IMPULSE = 0.03;
export const DEFAULT_PET_FORWARD_JUMP_IMPULSE_MIN = 0.003;
export const DEFAULT_PET_FORWARD_JUMP_IMPULSE_MAX = 0.012;

export const DEFAULT_PET_CLIMB_VELOCITY = 1.1;
