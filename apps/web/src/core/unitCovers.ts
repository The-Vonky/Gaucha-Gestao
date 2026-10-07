import { useCallback, useEffect, useRef, useState } from "react";
import { client, database } from "./client";
import { message } from "../shared/errors";
import { CoverImageError, type PreparedCover } from "./unitCoverImage";
import type { UnitCoverRow } from "./types";
// Core unit cover contract (Unit Cover v1). Modules consume covers only through
// useUnitCovers/resolveUnitCovers; they never sign, upload or own cover objects.
export const COVER_BUCKET = "unit-covers";
/** Signed URL lifetime in seconds. */
export const COVER_URL_TTL = 300;
/** Re-sign before expiry, so a freshly rendered <img> never gets an expiring URL. */
const RENEW_MARGIN_MS = 60_000;
/** Server limit of core.unit_covers per call. */
const BATCH = 100;
export type UnitCover = {
  unitId: string;
  assetId: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Entry = { cover: UnitCover | null; expiresAt: number };
// Memory only: signed URLs are never written to localStorage, sessionStorage or the database.
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const fresh = (entry: Entry | undefined) =>
  !!entry && entry.expiresAt - RENEW_MARGIN_MS > Date.now();
function sameOrigin(signed: string) {
  const origin = import.meta.env.VITE_SUPABASE_URL;
  try {
    return !origin || new URL(signed).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
/** One RPC and one batch signing call for up to 100 units. */
async function fetchBatch(ids: string[]) {
  const { data, error } = await database().rpc("unit_covers", { p_units: ids });
  if (error) throw error;
  const rows = (data ?? []) as UnitCoverRow[];
  const signedAt = Date.now();
  const urls = new Map<string, string>();
  if (rows.length) {
    if (!client) throw new Error("Configuração indisponível.");
    const signed = await client.storage
      .from(COVER_BUCKET)
      .createSignedUrls(
        rows.map((r) => r.object_key),
        COVER_URL_TTL,
      );
    if (signed.error) throw signed.error;
    for (const s of signed.data ?? [])
      if (s.path && s.signedUrl && !s.error && sameOrigin(s.signedUrl))
        urls.set(s.path, s.signedUrl);
  }
  const expiresAt = signedAt + COVER_URL_TTL * 1000;
  // Units without an authorized ready cover (or whose object could not be signed) use the fallback.
  for (const id of ids) cache.set(id, { cover: null, expiresAt });
  for (const r of rows) {
    const url = urls.get(r.object_key);
    if (url)
      cache.set(r.unit_id, {
        expiresAt,
        cover: {
          unitId: r.unit_id,
          assetId: r.asset_id,
          url,
          x: Number(r.position_x),
          y: Number(r.position_y),
          width: r.width,
          height: r.height,
        },
      });
  }
}
/**
 * Resolves covers for many units with ceil(n/100) RPCs and as many batch signing calls,
 * reusing fresh cached entries and requests already in flight.
 */
export async function resolveUnitCovers(
  ids: readonly string[],
  force = false,
): Promise<Map<string, UnitCover | null>> {
  const unique = [...new Set(ids)];
  const missing = unique.filter(
    (id) => force || (!fresh(cache.get(id)) && !inflight.has(id)),
  );
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const request: Promise<void> = fetchBatch(chunk).finally(() => {
      for (const id of chunk)
        if (inflight.get(id) === request) inflight.delete(id);
    });
    for (const id of chunk) inflight.set(id, request);
  }
  await Promise.all(
    new Set(unique.map((id) => inflight.get(id)).filter((p) => !!p)),
  );
  return new Map(unique.map((id) => [id, cache.get(id)?.cover ?? null]));
}
/** Drops cached covers (after a change) and asks mounted views to resolve again. */
export function invalidateUnitCovers(ids: readonly string[]) {
  for (const id of ids) cache.delete(id);
  for (const listener of listeners) listener();
}
/** Test seam: forget every cached cover. */
export function clearUnitCoverCache() {
  cache.clear();
  inflight.clear();
}
const EMPTY = new Map<string, UnitCover | null>();
/**
 * Covers for the given units, batch-resolved once per id set. `reportError` is
 * called by an <img> that failed: its unit is re-signed once (batched with other
 * failures in the same tick); a second failure for the same asset keeps the fallback.
 */
export function useUnitCovers(ids: readonly string[]) {
  const key = [...new Set(ids)].sort().join(",");
  const [state, setState] = useState({ key: "", covers: EMPTY });
  const [revision, setRevision] = useState(0);
  const retried = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const queue = useRef(new Set<string>());
  useEffect(() => {
    const listener = () => setRevision((r) => r + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    if (!key) return;
    let current = true;
    resolveUnitCovers(key.split(","))
      .then((covers) => {
        if (current) setState({ key, covers });
      })
      .catch(() => {
        // Covers are decorative: any failure keeps the fallback, never breaks the page.
        if (current) setState({ key, covers: EMPTY });
      });
    return () => {
      current = false;
    };
  }, [key, revision]);
  const reportError = useCallback((cover: UnitCover) => {
    if (retried.current.has(cover.assetId)) {
      failed.current.add(cover.assetId);
      setState((s) => ({ ...s, covers: new Map(s.covers).set(cover.unitId, null) }));
      return;
    }
    retried.current.add(cover.assetId);
    queue.current.add(cover.unitId);
    if (queue.current.size > 1) return;
    setTimeout(() => {
      const units = [...queue.current];
      queue.current.clear();
      resolveUnitCovers(units, true)
        .then((covers) =>
          setState((s) => {
            const next = new Map(s.covers);
            for (const [id, c] of covers)
              next.set(id, c && !failed.current.has(c.assetId) ? c : null);
            return { ...s, covers: next };
          }),
        )
        .catch(() =>
          setState((s) => {
            const next = new Map(s.covers);
            for (const id of units) next.set(id, null);
            return { ...s, covers: next };
          }),
        );
    }, 0);
  }, []);
  return { covers: state.key === key ? state.covers : EMPTY, reportError };
}

export type CoverStep = "uploading" | "confirming";
/**
 * Begin -> Storage upload (prepared JPEG only) -> confirm with framing. Any failure
 * after begin cancels the pending asset, so no broken cover is ever created.
 */
export async function uploadUnitCover(
  unitId: string,
  prepared: PreparedCover,
  position: { x: number; y: number },
  onStep: (step: CoverStep) => void = () => {},
) {
  if (!client) throw new Error("Configuração indisponível.");
  onStep("uploading");
  const begun = await database().rpc("begin_unit_cover_upload", {
    p_unit: unitId,
    p_mime_type: "image/jpeg",
    p_byte_size: prepared.blob.size,
    p_width: prepared.width,
    p_height: prepared.height,
  });
  if (begun.error) throw begun.error;
  const row = begun.data?.[0];
  if (!row) throw new Error("Não foi possível iniciar o envio.");
  try {
    const stored = await client.storage
      .from(COVER_BUCKET)
      .upload(row.object_key, prepared.blob, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "300",
      });
    if (stored.error) throw stored.error;
    onStep("confirming");
    const confirmed = await database().rpc("confirm_unit_cover_upload", {
      p_unit: unitId,
      p_asset: row.asset_id,
      p_position_x: position.x,
      p_position_y: position.y,
    });
    if (confirmed.error) throw confirmed.error;
  } catch (e) {
    // Best effort: a confirmed asset cannot be cancelled, so this never undoes a success.
    await database()
      .rpc("cancel_unit_cover_upload", { p_asset: row.asset_id })
      .then(
        () => undefined,
        () => undefined,
      );
    throw e;
  } finally {
    invalidateUnitCovers([unitId]);
  }
}
export async function setUnitCoverPosition(
  unitId: string,
  assetId: string,
  position: { x: number; y: number },
) {
  const { error } = await database().rpc("set_unit_cover_position", {
    p_unit: unitId,
    p_expected_asset: assetId,
    p_position_x: position.x,
    p_position_y: position.y,
  });
  invalidateUnitCovers([unitId]);
  if (error) throw error;
}
export async function removeUnitCover(unitId: string, assetId: string) {
  const { error } = await database().rpc("remove_unit_cover", {
    p_unit: unitId,
    p_expected_asset: assetId,
  });
  invalidateUnitCovers([unitId]);
  if (error) throw error;
}
/** Safe, specific messages; never raw server text. */
export function coverMessage(e: unknown) {
  if (e instanceof CoverImageError) return e.message;
  const error = (e ?? {}) as { code?: string; message?: string; statusCode?: string | number };
  const text = String(error.message ?? "");
  if (/Cover upload limit reached/.test(text))
    return "Há envios demais em andamento para esta unidade. Aguarde alguns minutos e tente novamente.";
  if (/Upload expired/.test(text)) return "O envio expirou. Selecione a foto novamente.";
  if (/object does not match/.test(text))
    return "A foto enviada não confere com o registro. Tente novamente.";
  if (error.code === "40001")
    return "A capa foi alterada por outra pessoa. Feche e abra novamente para ver a versão atual.";
  if (error.statusCode !== undefined && !error.code)
    return "O armazenamento recusou a foto. Tente novamente com outra imagem.";
  return message(e);
}
