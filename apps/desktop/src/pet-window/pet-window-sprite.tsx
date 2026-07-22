import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { msUntilNextAtlasFrame } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite, type PetSpriteProps } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { useEffect, useState } from "react";

/**
 * PetSprite with its own animation clock.
 *
 * The clock ticks only when the atlas is about to flip frames (every
 * 110-320ms) rather than at display refresh rate: pet windows are always-on, so
 * a 60Hz loop was a steady idle-CPU cost per pet. `performance.now()` shares
 * rAF's time origin, so the animation phase is unchanged.
 *
 * Owning the clock here — rather than in PetWindowView — keeps each frame flip
 * from re-rendering the whole window (drag/resize overlays, status card,
 * connect notice); only this sprite subtree updates.
 */
export function PetWindowSprite({
  animationState,
  ...rest
}: Omit<PetSpriteProps, "elapsedMs" | "animationState"> & {
  animationState: PetAnimationState;
}) {
  const [elapsedMs, setElapsedMs] = useState(() => performance.now());

  useEffect(() => {
    let isActive = true;
    let timeoutId = 0;

    const tick = () => {
      if (!isActive) {
        return;
      }

      const nextElapsedMs = performance.now();
      setElapsedMs(nextElapsedMs);
      timeoutId = window.setTimeout(tick, msUntilNextAtlasFrame(animationState, nextElapsedMs));
    };

    tick();

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [animationState]);

  return <PetSprite animationState={animationState} elapsedMs={elapsedMs} {...rest} />;
}
