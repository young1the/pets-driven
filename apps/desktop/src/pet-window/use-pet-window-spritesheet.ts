import { FALLBACK_CODEX_PET_SPRITESHEET_URL } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { useEffect, useState } from "react";
import { loadPetWindowSpritesheetUrl } from "@/pet-window/pet-window-spritesheet";

/**
 * Loads (and revokes) the object URL for a pet asset's spritesheet, falling back
 * to the bundled Codex sheet on error. Reloads when the asset changes.
 */
export function usePetWindowSpritesheet(assetId: string): string | null {
  const [spritesheetUrl, setSpritesheetUrl] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let dispose = () => {};

    setSpritesheetUrl(null);

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
        setSpritesheetUrl(spritesheet.url);
      });

    return () => {
      isActive = false;
      dispose();
    };
  }, [assetId]);

  return spritesheetUrl;
}
