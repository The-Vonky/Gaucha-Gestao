import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Modos isolados: a prova de conceito (ui-poc) e a galeria do Design System
// (design-system) nunca entram no bundle normal da aplicação.
// O proxy DEV versionado não é alterado; configurações locais não são pressupostas.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  ...(mode === "ui-poc"
    ? {
        build: {
          outDir: "dist/ui-poc",
          rollupOptions: { input: "tailwind-poc.html" },
        },
      }
    : {}),
  ...(mode === "design-system"
    ? {
        build: {
          outDir: "dist/design-system",
          rollupOptions: { input: "design-system/index.html" },
        },
      }
    : {}),
}));
