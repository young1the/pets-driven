import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import type { CSSProperties } from "react";
import type { CodexPetPackage } from "@/app/desktop-gateway";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";
import { useAnimationClock } from "@/app/pet-assets/use-animation-clock";

type PetLookStripProps = {
  packages: CodexPetPackage[];
  /**
   * Left out on the read-only strip (the setup wizard just shows what it
   * found); passed in when the strip is a picker.
   */
  selectedAssetId?: string | null;
  onSelect?: (assetId: string) => void;
};

/** One small, idling sprite + name — a compact preview cell for the strip. */
function PetLookCell({
  pet,
  elapsedMs,
  selected,
  onSelect,
}: {
  pet: CodexPetPackage;
  elapsedMs: number;
  selected: boolean;
  onSelect: ((assetId: string) => void) | undefined;
}) {
  const spritesheetUrl = usePetSpritesheetUrl(pet.id);

  const body = (
    <>
      <div style={petLookStage}>
        {spritesheetUrl ? (
          <PetSprite
            alt={`${pet.displayName} preview`}
            animationState="idle"
            elapsedMs={elapsedMs}
            imageUrl={spritesheetUrl}
            scale={0.42}
            showStatusBubble={false}
            size={PET_CELL_SIZE}
          />
        ) : null}
      </div>
      <span style={petLookName}>{pet.displayName}</span>
    </>
  );

  if (!onSelect) {
    return (
      <div style={petLookCell(false)} title={pet.displayName}>
        {body}
      </div>
    );
  }

  return (
    <button
      aria-pressed={selected}
      onClick={() => onSelect(pet.id)}
      style={{ ...petLookCell(selected), cursor: "pointer" }}
      title={pet.displayName}
      type="button"
    >
      {body}
    </button>
  );
}

/**
 * A compact, horizontally scrolling row of installed pet looks.
 *
 * Shared on purpose: the setup wizard shows the looks it found in the pets
 * folder, and the pet-edit screen lets one be picked — same catalog, same
 * shape, so they read the same.
 */
export function PetLookStrip({ packages, selectedAssetId = null, onSelect }: PetLookStripProps) {
  const elapsedMs = useAnimationClock();

  return (
    <div style={petLookStrip}>
      {packages.map((pet) => (
        <PetLookCell
          elapsedMs={elapsedMs}
          key={pet.id}
          onSelect={onSelect}
          pet={pet}
          selected={pet.id === selectedAssetId}
        />
      ))}
    </div>
  );
}

const petLookStrip: CSSProperties = {
  display: "flex",
  gap: "10px",
  overflowX: "auto",
  padding: "4px 2px 8px",
};
const petLookCell = (selected: boolean): CSSProperties => ({
  flex: "none",
  width: "84px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "6px",
  padding: "10px 8px",
  borderRadius: "14px",
  border: selected ? "1.5px solid var(--color-primary)" : "1px solid var(--border-soft)",
  background: selected ? "var(--surface-sunken)" : "var(--surface-card)",
});
const petLookStage: CSSProperties = {
  width: "48px",
  height: "48px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};
const petLookName: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "11.5px",
  fontWeight: 700,
  color: "var(--text-strong)",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
