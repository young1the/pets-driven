export type CursorSample = {
  at: number;
  position: { x: number; y: number };
};

/**
 * Lives on the "user-anchor" entity. Tracks the live host cursor position plus
 * a short ring buffer of recent samples so PerceptionSystem can derive speed
 * and PettingDetectionSystem can derive horizontal oscillation. `position` is
 * null until the host feeds the first CursorInput.
 */
export type CursorStateComponent = {
  type: "CursorState";
  position: { x: number; y: number } | null;
  samples: CursorSample[];
};

/**
 * Transient one-shot input written by the host once per tick when a live
 * cursor position is available (e.g. via world.feedCursorPosition()).
 * Consumed and cleared by CursorInputSystem in the same tick — mirrors the
 * ThrowImpulse one-shot pattern in features/interaction/components.ts.
 */
export type CursorInputComponent = {
  type: "CursorInput";
  position: { x: number; y: number };
  at: number;
};
