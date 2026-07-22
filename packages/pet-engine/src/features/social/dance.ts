/** Length of one shared dance beat. */
export const DANCE_BEAT_MS = 700;

const DANCE_LOOP_BEATS = 11;

/** Current beat within the repeating duet/group phrase. */
export function danceBeatIndex(elapsedMs: number): number {
  return Math.floor(Math.max(0, elapsedMs) / DANCE_BEAT_MS) % DANCE_LOOP_BEATS;
}

/** The final two beats are a stationary shared flourish. */
export function isDanceFlourish(elapsedMs: number): boolean {
  return danceBeatIndex(elapsedMs) >= 9;
}

/**
 * Horizontal offsets measured in body widths, ordered from left to right.
 * A pair performs a non-crossing duet: each pet steps in and returns, both
 * step out, then they reunite for a shared flourish. Larger groups take turns
 * stepping toward the centre before the same group finish.
 */
export function danceStepOffsets(participantCount: number, elapsedMs: number): number[] {
  const count = Math.max(0, participantCount);
  const beat = danceBeatIndex(elapsedMs);
  const offsets = Array.from({ length: count }, () => 0);

  if (count === 2) {
    const duet: readonly (readonly [number, number])[] = [
      [0, 0],
      [0, 0],
      [1.5, 0],
      [1.5, 0],
      [0, 0],
      [0, -1.5],
      [0, -1.5],
      [0, 0],
      [-0.5, 0.5],
      [0, 0],
      [0, 0],
    ];
    return [...(duet[beat] ?? [0, 0])];
  }

  if (beat >= 2 && beat < 2 + Math.min(count, 4)) {
    const rank = beat - 2;
    const centreRank = (count - 1) / 2;
    offsets[rank] = rank < centreRank ? 0.8 : rank > centreRank ? -0.8 : 0;
  } else if (beat === 8) {
    const centreRank = (count - 1) / 2;
    for (let rank = 0; rank < count; rank += 1) {
      offsets[rank] = rank < centreRank ? -0.5 : rank > centreRank ? 0.5 : 0;
    }
  }

  return offsets;
}
