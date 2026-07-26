import { useEffect, useState } from "react";

/**
 * A requestAnimationFrame clock, in milliseconds since the loop started.
 *
 * Shared by every sprite preview in the main window so they all tick off one
 * implementation. Pass `restartKey` to restart the clock when it changes: a
 * newly picked animation then begins on its own first frame instead of
 * resuming somewhere mid-loop. The key is carried in state so the render that
 * changes it — before the effect has re-run — already reads as zero.
 */
export function useAnimationClock(restartKey?: string): number {
  const [clock, setClock] = useState<{ key: string | undefined; elapsedMs: number }>({
    key: restartKey,
    elapsedMs: 0,
  });

  useEffect(() => {
    let isActive = true;
    let frame = 0;
    let startedAt: number | null = null;

    const tick = (now: number) => {
      if (!isActive) {
        return;
      }

      if (startedAt === null) {
        startedAt = now;
      }

      setClock({ key: restartKey, elapsedMs: now - startedAt });
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      isActive = false;
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [restartKey]);

  return clock.key === restartKey ? clock.elapsedMs : 0;
}
