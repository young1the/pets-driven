export const DEFAULT_PET_BODY_SIZE = {
  width: 32,
  height: 38,
} as const;

export const DEFAULT_PET_WALK_FORCE = 0.01;
export const DEFAULT_PET_CONTROL_SPEED = 1.4;

// Tuned so the default pet jumps above its own body height under Matter.js gravity.
export const DEFAULT_PET_JUMP_IMPULSE = 0.03;
export const DEFAULT_PET_FORWARD_JUMP_IMPULSE_MIN = 0.003;
export const DEFAULT_PET_FORWARD_JUMP_IMPULSE_MAX = 0.012;

export const DEFAULT_PET_CLIMB_VELOCITY = 1.1;
