/** Normalise an unknown thrown value into a displayable message string. */
export function formatCommandError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
