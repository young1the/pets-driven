import React from "react";
import ReactDOM from "react-dom/client";
import { ProtoDesignSystem } from "./playground/browser/proto-design-system";
import "./styles.css";
import "./proto-keyframes.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ProtoDesignSystem />
  </React.StrictMode>,
);
