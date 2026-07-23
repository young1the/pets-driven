import { useEffect, useState } from "react";
import { type CodexPetPackage, type DesktopGateway, desktopGateway } from "@/app/desktop-gateway";

/**
 * The installed Pet Assets a pet can wear, loaded on demand.
 *
 * Listing them costs a shell round trip that scans the pet source folder from
 * disk, so it is deferred behind `enabled` — the main window only needs the
 * catalog once the user opens a pet's edit screen. An unreadable folder yields
 * an empty list rather than an error: the rest of the edit screen still works,
 * there is simply nothing to switch to.
 */
export function usePetAssetOptions(
  enabled: boolean,
  gateway: DesktopGateway = desktopGateway,
): CodexPetPackage[] {
  const [packages, setPackages] = useState<CodexPetPackage[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isActive = true;

    void gateway
      .listPetPackages()
      .catch(() => [])
      .then((loaded) => {
        if (isActive) {
          setPackages(loaded);
        }
      });

    return () => {
      isActive = false;
    };
  }, [enabled, gateway]);

  return packages;
}
