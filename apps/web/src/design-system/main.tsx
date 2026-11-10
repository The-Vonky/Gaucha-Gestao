import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Same order as the application: tokens, base components, then the theme layer.
import "../shared/styles/tokens.css";
import "../shared/styles/base.css";
import "../shared/theme/theme.css";
import { DesignSystemGallery } from "./Gallery";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesignSystemGallery />
  </StrictMode>,
);
