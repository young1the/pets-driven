import {
  PET_CELL_SIZE,
  type PetAnimationState,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";
import { useAnimationClock } from "@/app/pet-assets/use-animation-clock";

type PetPortraitProps = {
  assetId: string;
  name: string;
  /** Which atlas row to draw. @default "idle" */
  animationState?: PetAnimationState;
  width?: number;
  height?: number;
};

/**
 * A static first-frame portrait of a pet, sized to fill a showcase card's art
 * slot. Renders the real spritesheet so the home mirrors the desktop pet.
 */
export function PetPortrait({ animationState = "idle", ...rest }: PetPortraitProps) {
  return <PetPortraitStage animationState={animationState} elapsedMs={0} {...rest} />;
}

/**
 * The same portrait, playing its row on an animation clock. Kept apart from
 * `PetPortrait` so the home fan's cards do not each run a frame loop — only
 * the screen that asks for playback pays for it.
 */
export function AnimatedPetPortrait({ animationState = "idle", ...rest }: PetPortraitProps) {
  const elapsedMs = useAnimationClock(animationState);

  return <PetPortraitStage animationState={animationState} elapsedMs={elapsedMs} {...rest} />;
}

function PetPortraitStage({
  assetId,
  name,
  animationState,
  elapsedMs,
  width = 192,
  height = 208,
}: PetPortraitProps & { animationState: PetAnimationState; elapsedMs: number }) {
  const spritesheetUrl = usePetSpritesheetUrl(assetId);
  const scale = width / PET_CELL_SIZE.width;

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {spritesheetUrl ? (
        <PetSprite
          alt={`${name} portrait`}
          animationState={animationState}
          elapsedMs={elapsedMs}
          imageUrl={spritesheetUrl}
          scale={scale}
          size={PET_CELL_SIZE}
        />
      ) : null}
    </div>
  );
}
