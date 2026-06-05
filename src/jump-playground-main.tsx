import React from "react";
import ReactDOM from "react-dom/client";
import { JumpPlaygroundApp } from "./playground/browser/jump-playground-app";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <JumpPlaygroundApp />
  </React.StrictMode>,
);
