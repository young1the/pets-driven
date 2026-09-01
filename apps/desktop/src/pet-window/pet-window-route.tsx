import { pushSearchParams } from "@/app/spa-navigation";
import { PetWindowFixtureSwitcher } from "@/pet-window/pet-window-fixture-switcher";
import { PET_WINDOW_FIXTURES, resolvePetWindowFixture } from "@/pet-window/pet-window-fixtures";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";
import { PetWindowView } from "@/pet-window/pet-window-view";
import { usePetWindowKeyboardControl } from "@/pet-window/use-pet-window-keyboard-control";

/**
 * Resolve the pet a URL asks for, or null when it addresses another surface.
 *
 * Kept free of any main-window import so `pet-window-main.tsx` — the lean entry
 * every pet's OS window actually loads — can route without pulling the
 * dashboard, playground or terminal into a dozen webviews.
 */
export function petWindowRouteParams(): PetWindowRouteParams | null {
  const params = new URLSearchParams(window.location.search);
  // A bare `?fixture=<pet-window-fixture-id>` (no `surface=pet-window`, no
  // petId/assetId) should be enough to land on the pet-window tweak menu —
  // resolvePetWindowFixture already gates this to dev + loopback.
  const petWindowFixture = resolvePetWindowFixture(window.location.search, {
    hostname: window.location.hostname,
    isDev: import.meta.env.DEV,
  });

  if (params.get("surface") !== "pet-window" && !petWindowFixture) {
    return null;
  }

  return {
    petId: params.get("petId") || petWindowFixture?.pet.petId || "pet-a",
    assetId: params.get("assetId") || petWindowFixture?.pet.assetId || "bloop",
    windowIndex: params.get("windowIndex")
      ? Number(params.get("windowIndex"))
      : (petWindowFixture?.pet.windowIndex ?? 1),
    name: params.get("name") ?? petWindowFixture?.pet.name ?? undefined,
  };
}

/**
 * Route the current URL to a pet overlay, or render nothing when it addresses
 * another surface. Exists so the overlay entry can pull this whole module — the
 * status card, the sprite atlas, the fixtures — behind one dynamic import: a
 * trinket overlay shares the same entry and has no business parsing any of it.
 */
export function PetWindowEntry({
  navigateSearchParams,
}: {
  navigateSearchParams?: (mutate: (params: URLSearchParams) => void) => void;
}) {
  const pet = petWindowRouteParams();

  return pet ? <PetWindowSurface navigateSearchParams={navigateSearchParams} pet={pet} /> : null;
}

/** One pet overlay window, plus the dev-only fixture switcher when armed. */
export function PetWindowSurface({
  pet,
  // Defaults to a plain URL update (no forced remount) so call sites that don't
  // own a router — the lean entry and tests — need not wire this up.
  navigateSearchParams = pushSearchParams,
}: {
  pet: PetWindowRouteParams;
  navigateSearchParams?: (mutate: (params: URLSearchParams) => void) => void;
}) {
  const petWindowFixture = resolvePetWindowFixture(window.location.search, {
    hostname: window.location.hostname,
    isDev: import.meta.env.DEV,
  });

  // Here rather than in the surface: one relay per OS window, and this window
  // holds exactly one pet — so its id is also the answer to which world the
  // keys belong to (a playground fixture pet's world, or the adopted one).
  usePetWindowKeyboardControl(pet.petId);

  return (
    <>
      <PetWindowView
        pet={pet}
        previewPresentation={petWindowFixture?.presentation}
        previewScale={petWindowFixture?.scale}
        previewConnectNotice={petWindowFixture?.connectNotice}
        previewNote={petWindowFixture?.note}
      />
      {petWindowFixture ? (
        <PetWindowFixtureSwitcher
          activeId={petWindowFixture.id}
          onSelect={(fixtureId) =>
            navigateSearchParams((params) => {
              const fixture = PET_WINDOW_FIXTURES.find((candidate) => candidate.id === fixtureId);
              params.set("fixture", fixtureId);
              if (fixture) {
                params.set("petId", fixture.pet.petId);
                params.set("assetId", fixture.pet.assetId);
                params.set("windowIndex", String(fixture.pet.windowIndex));
                if (fixture.pet.name) {
                  params.set("name", fixture.pet.name);
                } else {
                  params.delete("name");
                }
              }
            })
          }
        />
      ) : null}
    </>
  );
}
