/**
 * Small pure presentation helpers shared by the host component and the
 * main-window surface. Kept in their own module so both can import them without
 * a circular dependency.
 */

const PET_GRADIENTS: { from: string; to: string }[] = [
  { from: "#FF7FB4", to: "#F95E9E" },
  { from: "#5AC8E8", to: "#2F9CC4" },
  { from: "#A28BF0", to: "#7560D8" },
  { from: "#5BD08A", to: "#2E9E63" },
  { from: "#8B7FE8", to: "#6F5FD6" },
  { from: "#FF7A5C", to: "#E04428" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic gradient for a pet, derived from its id. */
export function petGradient(petId: string): { from: string; to: string } {
  return PET_GRADIENTS[hashString(petId) % PET_GRADIENTS.length];
}

/** The pet's memo, or a fallback label when it is empty. */
export function cardNote(memo: string | undefined, emptyLabel: string): string {
  const trimmed = memo?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : emptyLabel;
}

/** Compact "parent/leaf" rendering of a working-directory path. */
export function shortWorkingDir(dirPath: string): string {
  const parts = dirPath.split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return dirPath;
  const last = parts[parts.length - 1];
  if (parts.length === 1) return last;
  const parent = parts[parts.length - 2];
  const displayParent = /^[a-zA-Z]:$/.test(parent) ? "~" : parent;
  return `${displayParent}/${last}`;
}
