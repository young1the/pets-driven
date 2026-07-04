import React from "react";
import ReactDOM from "react-dom/client";
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DesktopLocaleProvider>{resolveRoot()}</DesktopLocaleProvider>
  </React.StrictMode>,
);
