import { Badge, Card } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { useEffect, useState } from "react";
import type { CodexPetPackage } from "@/app/desktop-gateway";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";

type PetAssetGridProps = {
  packages: CodexPetPackage[];
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
};

function useAnimationClock() {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    let isActive = true;
    let animationFrame = 0;

    const tick = (nextElapsedMs: number) => {
      if (!isActive) {
        return;
      }

      setElapsedMs(nextElapsedMs);
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      isActive = false;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  return elapsedMs;
}

function PetAssetCard({
  pet,
  elapsedMs,
  selected,
  onSelect,
}: {
  pet: CodexPetPackage;
  elapsedMs: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("desktop");
  const spritesheetUrl = usePetSpritesheetUrl(pet.id);

  return (
    <Card
      aria-pressed={selected}
      className="pd-asset-card"
      interactive
      onClick={onSelect}
      padding="sm"
      role="button"
      tabIndex={0}
      tone={selected ? "blossom" : "default"}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="pd-asset-card__stage">
        {spritesheetUrl ? (
          <PetSprite
            alt={`${pet.displayName} preview`}
            animationState="idle"
            elapsedMs={elapsedMs}
            imageUrl={spritesheetUrl}
            scale={0.5}
            showStatusBubble={false}
            size={PET_CELL_SIZE}
          />
        ) : null}
      </div>
      <div className="pd-asset-card__meta">
        <strong>{pet.displayName}</strong>
        {selected && <Badge dot>{t("petAssets.chosen")}</Badge>}
      </div>
      <p>{pet.description}</p>
    </Card>
  );
}

/**
 * The installed Pet Assets as a horizontally scrolling strip of animated
 * preview cards, one selectable at a time.
 *
 * Shared on purpose: a Pet Asset is picked at Pet Birth and can be changed
 * afterwards from the pet-edit screen, and both surfaces are the same choice
 * over the same catalog — so they present it the same way.
 */
export function PetAssetGrid({ packages, selectedAssetId, onSelect }: PetAssetGridProps) {
  const elapsedMs = useAnimationClock();

  return (
    <div className="pd-asset-grid">
      {packages.map((pet) => (
        <PetAssetCard
          elapsedMs={elapsedMs}
          key={pet.id}
          onSelect={() => onSelect(pet.id)}
          pet={pet}
          selected={pet.id === selectedAssetId}
        />
      ))}
    </div>
  );
}
