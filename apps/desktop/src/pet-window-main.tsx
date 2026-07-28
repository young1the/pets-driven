import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { DesktopLocaleProvider } from "./app/i18n/desktop-locale";
import { DesktopThemeProvider } from "./app/theme/desktop-theme";
import { ItemWindowSurface, itemWindowRouteParams } from "./pet-window/item-window-route";
import "./styles/pet-window-entry.css";

// One menu window exists at a time, against a dozen pet windows that never open
// it — so the menu loads on demand rather than in every pet's webview.
const PetContextMenuView = lazy(() =>
  import("./pet-window/pet-context-menu-view").then((module) => ({
    default: module.PetContextMenuView,
  })),
);

// The pet surface carries the sprite atlas and the status card — a few hundred
// kilobytes a trinket overlay, which shares this entry, must never parse just to
// draw one glyph. Same reasoning as the menu above: load it in the windows that
// are actually pets.
const PetWindowEntry = lazy(() =>
  import("./pet-window/pet-window-route").then((module) => ({
    default: module.PetWindowEntry,
  })),
);

/**
 * The overlay entry: one lean bundle shared by every pet's OS window, its owned
 * context menu, and the trinket overlays.
 *
 * These surfaces used to load `index.html`, so each of a user's pet webviews
 * parsed and retained the whole application — dashboard, onboarding, terminal,
 * playground — to draw one sprite. With a dozen pets deployed that multiplied
 * into real memory. This entry imports only what an overlay renders.
 */
function OverlayRoot() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("surface") === "pet-context-menu") {
    const petId = params.get("petId") ?? "pet-a";

    return (
      <Suspense fallback={null}>
        <PetContextMenuView
          note={decodeURIComponent(params.get("note") ?? "")}
          petId={petId}
          petName={decodeURIComponent(params.get("petName") ?? petId)}
        />
      </Suspense>
    );
  }

  const item = itemWindowRouteParams(window.location.search);

  if (item) {
    return <ItemWindowSurface item={item} />;
  }

  return (
    <Suspense fallback={null}>
      <PetWindowEntry />
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DesktopThemeProvider>
      <DesktopLocaleProvider>
        <OverlayRoot />
      </DesktopLocaleProvider>
    </DesktopThemeProvider>
  </React.StrictMode>,
);
