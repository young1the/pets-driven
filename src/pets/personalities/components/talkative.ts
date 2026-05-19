/**
 * Personality component that allows a pet to speak after an idle duration.
 */
export type Talkative = { type: "Talkative"; idleAfterMs: number };

export const talkativeDefinition = {
  type: "Talkative" as const,
  validate(value: unknown): value is Talkative {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Talkative).type === "Talkative" &&
      typeof (value as Talkative).idleAfterMs === "number"
    );
  },
};
