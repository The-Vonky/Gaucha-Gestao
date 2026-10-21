import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Modo isolado: a prova de conceito nunca entra no bundle normal da aplicação.
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
}));
