import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { DevFixtureSwitcher } from "./app/dev-fixture-switcher";
import { resolveDesktopFixture } from "./app/dev-fixtures";
import { DesktopLocaleProvider } from "./app/i18n/desktop-locale";
import { PetsDrivenApp } from "./app/pets-driven-app";
import { pushSearchParams } from "./app/spa-navigation";
import { DesktopThemeProvider } from "./app/theme/desktop-theme";
import { PetContextMenuView } from "./pet-window/pet-context-menu-view";
// PROTOTYPE gate — `?surface=working-signal-lab` (dev + loopback only). Delete
// with working-signal-lab.tsx once a working-signal direction is picked.
import { WorkingSignalLab } from "./pet-window/working-signal-lab";
import "./styles/main.css";

type NavigateSearchParams = (mutate: (params: URLSearchParams) => void) => void;

function RootSurface({ navigateSearchParams }: { navigateSearchParams: NavigateSearchParams }) {
  const params = new URLSearchParams(window.location.search);

  if (
    import.meta.env.DEV &&
    params.get("surface") === "working-signal-lab" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1")
  ) {
    return <WorkingSignalLab />;
  }

  if (params.get("surface") === "pet-context-menu") {
    const petId = params.get("petId") ?? "pet-a";
    const petName = decodeURIComponent(params.get("petName") ?? petId);
    const note = decodeURIComponent(params.get("note") ?? "");

    return <PetContextMenuView note={note} petId={petId} petName={petName} />;
  }

  return <PetsDrivenApp navigateSearchParams={navigateSearchParams} />;
}

function Root() {
  // Bumped on every URL-driven state change (fixture switch, back/forward)
  // so the fixture-seeded subtree below remounts with fresh initial state —
  // the same effect a full reload would have, without leaving the SPA.
  const [navVersion, setNavVersion] = useState(0);

  useEffect(() => {
    function handlePopState() {
      setNavVersion((version) => version + 1);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigateSearchParams(mutate: (params: URLSearchParams) => void) {
    pushSearchParams(mutate);
    setNavVersion((version) => version + 1);
  }

  const devFixture = resolveDesktopFixture(window.location.search, {
    hostname: window.location.hostname,
    isDev: import.meta.env.DEV,
  });

  return (
    <DesktopThemeProvider>
      <DesktopLocaleProvider>
        <RootSurface key={navVersion} navigateSearchParams={navigateSearchParams} />
        {devFixture ? (
          <DevFixtureSwitcher
            activeId={devFixture.id}
            onSelect={(fixtureId) =>
              navigateSearchParams((params) => params.set("fixture", fixtureId))
            }
          />
        ) : null}
      </DesktopLocaleProvider>
    </DesktopThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
