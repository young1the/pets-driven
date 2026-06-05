import React from "react";
import ReactDOM from "react-dom/client";
import { ClimbPlaygroundApp } from "./playground/browser/climb-playground-app";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ClimbPlaygroundApp />
  </React.StrictMode>,
);
