import { useEffect, useState } from "react";
import { FALLBACK_CODEX_PET_SPRITESHEET_URL } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { loadPetWindowSpritesheetUrl } from "@/pet-window/pet-window-spritesheet";

/** Resolve a pet asset's spritesheet URL, disposing object URLs on unmount. */
export function usePetSpritesheetUrl(assetId: string): string | null {
  const [spritesheet, setSpritesheet] = useState<{
    assetId: string;
    url: string | null;
  }>({ assetId, url: null });

  useEffect(() => {
    let isActive = true;
    let dispose = () => {};

    setSpritesheet({ assetId, url: null });

    void loadPetWindowSpritesheetUrl(assetId)
      .catch(() => ({
        url: FALLBACK_CODEX_PET_SPRITESHEET_URL,
        dispose: () => {},
      }))
      .then((spritesheet) => {
        if (!isActive) {
          spritesheet.dispose();
          return;
        }

        dispose = spritesheet.dispose;
        setSpritesheet({ assetId, url: spritesheet.url });
      });

    return () => {
      isActive = false;
      dispose();
    };
  }, [assetId]);

  return spritesheet.assetId === assetId ? spritesheet.url : null;
}
