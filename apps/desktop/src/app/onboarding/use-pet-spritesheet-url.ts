import { useEffect, useState } from "react";
import {
  FALLBACK_CODEX_PET_SPRITESHEET_URL,
} from "@/pets/assets/codex-pet-fixtures";
import { loadPetWindowSpritesheetUrl } from "@/pet-window/pet-window-spritesheet";

/** Resolve a pet asset's spritesheet URL, disposing object URLs on unmount. */
export function usePetSpritesheetUrl(assetId: string): string {
  const [url, setUrl] = useState(FALLBACK_CODEX_PET_SPRITESHEET_URL);

  useEffect(() => {
    let isActive = true;
    let dispose = () => {};

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
        setUrl(spritesheet.url);
      });

    return () => {
      isActive = false;
      dispose();
    };
  }, [assetId]);

  return url;
}
