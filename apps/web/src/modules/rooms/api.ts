import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../core/client";
import { message } from "../../shared/errors";
export type Booking = {
  id: string;
  booked_for: string;
  secretary_notes: string | null;
  starts_at: string;
  ends_at: string;
  version: number;
};
export type Request = Omit<Booking, "secretary_notes"> & {
  purpose: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decision_reason: string | null;
  booking_status: string | null;
};
export type Summary = {
  name: string;
  server_now: string;
  in_use: boolean;
  today_count: number;
  next_start: string | null;
  pending_count?: number;
};
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!client) throw new Error("Ambiente indisponível.");
  const { data, error } = await (client as unknown as SupabaseClient)
    .schema("public")
    .rpc(`room_booking_${name}`, args);
  if (error) throw error;
  return data as T;
}
export function roomMessage(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (e?.code === "23P01")
    return "Horário ocupado. Atualize a agenda e escolha outro intervalo.";
  if (e?.code === "23514" && e.message && !/violates|Invalid/.test(e.message))
    return e.message;
  return message(error);
}
export const zone = "America/Sao_Paulo";
export const day = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
export const time = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
/** Resolve horário civil pelo fuso IANA, sem depender do fuso do navegador. */
export function instant(date: string, hour: string) {
  const target = Date.parse(`${date}T${hour}:00Z`);
  let value = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const local = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
    value += target - local;
  }
  return new Date(value).toISOString();
}
