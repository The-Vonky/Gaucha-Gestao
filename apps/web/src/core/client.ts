import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
function publicKey(value: string): boolean {
  if (value.startsWith("sb_publishable_")) return true;
  try {
    return (
      JSON.parse(
        atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ).role === "anon"
    );
  } catch {
    return false;
  }
}
export const client =
  url && key && publicKey(key)
    ? createClient<Database>(url, key, { db: { schema: "core" } })
    : null;
export function database() {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  return client.schema("core");
}
