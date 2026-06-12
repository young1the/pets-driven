import React from "react";
import ReactDOM from "react-dom/client";
import { PlaygroundApp } from "./playground/browser/playground-app";
import "./styles/playground-entry.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PlaygroundApp />
  </React.StrictMode>,
);
