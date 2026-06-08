import React from "react";
import ReactDOM from "react-dom/client";
import { ProtoBehaviorLab } from "./playground/browser/proto-behavior-lab";
import "./styles.css";
import "./proto-keyframes.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ProtoBehaviorLab />
  </React.StrictMode>,
);
