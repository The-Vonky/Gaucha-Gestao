import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Token and global styles load before any component stylesheet.
import "./shared/styles/tokens.css";
import "./shared/styles/base.css";
import "./app/styles.css";
import { App } from "./app/App";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
