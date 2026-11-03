import assert from "node:assert/strict";
import { createServer } from "vite";

/** Reutiliza o Vite local do mantenedor quando já está ativo; nunca o encerra. */
export async function salesLocalWeb(config) {
  const url = "http://127.0.0.1:5173";
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(3000) }); }
  catch (error) { if (error.cause?.code !== "ECONNREFUSED") throw error; }
  if (response) {
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes("/@vite/client"), "Porta ocupada por serviço inesperado: não alterar");
    const source = await fetch(`${url}/src/modules/sales/SalesPage.tsx`);
    assert.equal(source.status, 200);
    assert.ok((await source.text()).includes("Vendas / Maquininhas"), "Aplicação local inesperada");
    console.log("Vite local existente confirmado e reutilizado; processo do mantenedor preservado.");
    return { close: async () => {} };
  }
  process.env.VITE_SUPABASE_URL = config.API_URL;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = config.ANON_KEY;
  const server = await createServer({ configFile: "apps/web/vite.config.ts", root: "apps/web", server: { host: "127.0.0.1", port: 5173, strictPort: true } });
  await server.listen();
  return server;
}
