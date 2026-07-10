import React from "react";
import ReactDOM from "react-dom/client";
import { DevFixtureSwitcher } from "./app/dev-fixture-switcher";
import { resolveDesktopFixture } from "./app/dev-fixtures";
import { PetsDrivenApp } from "./app/pets-driven-app";
import { DesktopLocaleProvider } from "./app/i18n/desktop-locale";
import { PetContextMenuView } from "./pet-window/pet-context-menu-view";
import "./styles/main.css";

function resolveRoot() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("surface") === "pet-context-menu") {
    const petId = params.get("petId") ?? "pet-a";
    const petName = decodeURIComponent(params.get("petName") ?? petId);
    const note = decodeURIComponent(params.get("note") ?? "");

    return <PetContextMenuView note={note} petId={petId} petName={petName} />;
  }

  return <PetsDrivenApp />;
}

const devFixture = resolveDesktopFixture(window.location.search, {
  hostname: window.location.hostname,
  isDev: import.meta.env.DEV,
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DesktopLocaleProvider>
      {resolveRoot()}
      {devFixture ? <DevFixtureSwitcher activeId={devFixture.id} /> : null}
    </DesktopLocaleProvider>
  </React.StrictMode>,
);
