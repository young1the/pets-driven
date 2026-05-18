export type SeeksUser = { type: "SeeksUser"; distance: number };

export const seeksUserDefinition = {
  type: "SeeksUser" as const,
  validate(value: unknown): value is SeeksUser {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as SeeksUser).type === "SeeksUser" &&
      typeof (value as SeeksUser).distance === "number"
    );
  },
};
