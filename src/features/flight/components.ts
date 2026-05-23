/**
 * Flight movement tuning. Component presence means the entity can fly; the
 * active locomotion state decides whether flight is currently in control.
 */
export type CanFlyComponent = {
  type: "CanFly";
  gravityScale: number;
  hoverStrength: number;
};
