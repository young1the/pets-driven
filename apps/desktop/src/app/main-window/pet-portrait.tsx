import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";

type PetPortraitProps = {
  assetId: string;
  name: string;
  width?: number;
  height?: number;
};

/**
 * A static idle-frame portrait of a pet, sized to fill a showcase card's art
 * slot. Renders the real spritesheet so the home mirrors the desktop pet.
 */
export function PetPortrait({
  assetId,
  name,
  width = 192,
  height = 208,
}: PetPortraitProps) {
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
      <PetSprite
        alt={`${name} portrait`}
        elapsedMs={0}
        imageUrl={spritesheetUrl}
        intent={{ kind: "idle", facing: "right" }}
        scale={scale}
        size={PET_CELL_SIZE}
      />
    </div>
  );
}
