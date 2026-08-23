/**
 * How much the pets are allowed to intrude, as one world-level dial.
 *
 * The levels are cumulative, and each one only takes something away:
 *
 * - `off` — ordinary companion life.
 * - `quiet` — companion chatter is silenced. No idle line, no pet-to-pet
 *   conversation, no spoken answer to being petted. Agent work state is never
 *   silenced at any level: reporting its task is the whole reason a pet is on
 *   the screen, and a user who wanted that gone would hide the pet instead.
 * - `still` — quiet, and every pet also stays where it is: no wandering, no
 *   social errands, no walking after the cursor or a trinket. The user can
 *   still pick a pet up, throw it, and pet it, and gravity still applies — a
 *   stilled pet is parked, not switched off.
 *
 * Lives on `WorldStepContext` rather than on a component, because it is one
 * answer for the whole world: a pet deployed while the mode is on is stilled
 * without anyone having to remember to stamp it, and turning the mode off
 * leaves nothing behind to clean up.
 */
export type QuietMode = "off" | "quiet" | "still";

export const DEFAULT_QUIET_MODE: QuietMode = "off";

/** Whether companion chatter must not reach the screen at this level. */
export function isChatterSilenced(mode: QuietMode): boolean {
  return mode !== "off";
}

/** Whether pets must stay where they are at this level. */
export function isMovementStilled(mode: QuietMode): boolean {
  return mode === "still";
}
