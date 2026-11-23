import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Modo isolado: a prova de conceito nunca entra no bundle normal da aplicação.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const identityProxy = env.VITE_GG_IDENTITY_ENABLED === "true"
    && /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(env.VITE_SUPABASE_URL);
  return {
    plugins: [react(), tailwindcss()],
    ...(identityProxy && {
      server: { proxy: { "/auth/v1/identity": env.VITE_SUPABASE_URL } },
    }),
    ...(mode === "ui-poc"
      ? {
          build: {
            outDir: "dist/ui-poc",
            rollupOptions: { input: "tailwind-poc.html" },
          },
        }
      : {}),
  };
});
