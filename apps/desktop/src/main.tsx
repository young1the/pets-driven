import React from "react";
import ReactDOM from "react-dom/client";
import { PetsDrivenApp } from "./app/pets-driven-app";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PetsDrivenApp />
  </React.StrictMode>,
);
