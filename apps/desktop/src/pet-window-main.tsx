import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { DesktopLocaleProvider } from "./app/i18n/desktop-locale";
import { DesktopThemeProvider } from "./app/theme/desktop-theme";
import { PetWindowSurface, petWindowRouteParams } from "./pet-window/pet-window-route";
import "./styles/pet-window-entry.css";

// One menu window exists at a time, against a dozen pet windows that never open
// it — so the menu loads on demand rather than in every pet's webview.
const PetContextMenuView = lazy(() =>
  import("./pet-window/pet-context-menu-view").then((module) => ({
    default: module.PetContextMenuView,
  })),
);

/**
 * The overlay entry: one lean bundle shared by every pet's OS window and its
 * owned context menu.
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

  const pet = petWindowRouteParams();

  return pet ? <PetWindowSurface pet={pet} /> : null;
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
