/**
 * Personality component that keeps a pet away from dense groups.
 */
export type AvoidsCrowds = { type: "AvoidsCrowds"; radius: number };

export const avoidsCrowdsDefinition = {
  type: "AvoidsCrowds" as const,
  validate(value: unknown): value is AvoidsCrowds {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as AvoidsCrowds).type === "AvoidsCrowds" &&
      typeof (value as AvoidsCrowds).radius === "number"
    );
  },
};
