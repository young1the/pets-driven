/**
 * Personality component that increases exploratory or investigative behavior.
 */
export type Curious = { type: "Curious"; weight: number };

export const curiousDefinition = {
  type: "Curious" as const,
  validate(value: unknown): value is Curious {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Curious).type === "Curious" &&
      typeof (value as Curious).weight === "number"
    );
  },
};
