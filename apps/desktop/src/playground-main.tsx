import React from "react";
import ReactDOM from "react-dom/client";
import { DesktopLocaleProvider } from "./app/i18n/desktop-locale";
import { PlaygroundApp } from "./playground/browser/playground-app";
import "./styles/playground-entry.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DesktopLocaleProvider>
      <PlaygroundApp />
    </DesktopLocaleProvider>
  </React.StrictMode>,
);
