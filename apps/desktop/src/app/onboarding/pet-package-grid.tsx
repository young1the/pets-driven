import { useEffect, useState } from "react";
import { Badge, Card } from "@pets-driven/design-system";
import type { CodexPetPackage } from "@/app/desktop-gateway";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";

type PetPackageGridProps = {
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

function PetPackageCard({
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
  const spritesheetUrl = usePetSpritesheetUrl(pet.id);

  return (
    <Card
      aria-pressed={selected}
      className="onboarding-pet-card"
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
      <div className="onboarding-pet-card__stage">
        <PetSprite
          alt={`${pet.displayName} preview`}
          elapsedMs={elapsedMs}
          imageUrl={spritesheetUrl}
          intent={{ kind: "idle" }}
          scale={0.5}
          showStatusBubble={false}
          size={PET_CELL_SIZE}
        />
      </div>
      <div className="onboarding-pet-card__meta">
        <strong>{pet.displayName}</strong>
        {selected && <Badge dot>Chosen</Badge>}
      </div>
      <p>{pet.description}</p>
    </Card>
  );
}

export function PetPackageGrid({
  packages,
  selectedAssetId,
  onSelect,
}: PetPackageGridProps) {
  const elapsedMs = useAnimationClock();

  return (
    <div className="onboarding-pet-grid">
      {packages.map((pet) => (
        <PetPackageCard
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
