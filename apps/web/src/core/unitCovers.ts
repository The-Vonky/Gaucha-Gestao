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
// Signed URLs are private to the principal that resolved them. `access` identifies the current
// principal and its grants (set by the AuthProvider); every change bumps `epoch`, and a result
// captured under an older epoch is never cached or returned. Per-unit `versions` do the same
// for invalidations after a mutation.
let access = "";
let epoch = 0;
const versions = new Map<string, number>();
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const version = (id: string) => versions.get(id) ?? 0;
const fresh = (entry: Entry | undefined) =>
  !!entry && entry.expiresAt - RENEW_MARGIN_MS > Date.now();
const notify = () => {
  for (const listener of listeners) listener();
};
function sameOrigin(signed: string) {
  const origin = import.meta.env.VITE_SUPABASE_URL;
  try {
    return !origin || new URL(signed).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
/** One RPC and one batch signing call for up to 100 units. */
async function fetchBatch(ids: string[], from: number, captured: number[]) {
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
  // A response that finishes after an access change or an invalidation is dropped.
  if (from !== epoch) return;
  const expiresAt = signedAt + COVER_URL_TTL * 1000;
  const entries = new Map<string, Entry>();
  // Units without an authorized ready cover (or whose object could not be signed) use the fallback.
  for (const id of ids) entries.set(id, { cover: null, expiresAt });
  for (const r of rows) {
    const url = urls.get(r.object_key);
    if (url)
      entries.set(r.unit_id, {
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
  ids.forEach((id, i) => {
    if (version(id) === captured[i]) cache.set(id, entries.get(id)!);
  });
}
/**
 * Entries for many units with ceil(n/100) RPCs and as many batch signing calls, reusing fresh
 * cached entries and requests in flight. A unit invalidated while its request was in flight is
 * resolved again; after an access change nothing is returned.
 */
async function resolveEntries(ids: readonly string[], force = false) {
  const from = epoch;
  const result = new Map<string, Entry>();
  let todo = [...new Set(ids)];
  while (todo.length) {
    const missing = todo.filter(
      (id) => force || (!fresh(cache.get(id)) && !inflight.has(id)),
    );
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const request: Promise<void> = fetchBatch(
        chunk,
        from,
        chunk.map(version),
      ).finally(() => {
        for (const id of chunk)
          if (inflight.get(id) === request) inflight.delete(id);
      });
      for (const id of chunk) inflight.set(id, request);
    }
    await Promise.all(
      new Set(todo.map((id) => inflight.get(id)).filter((p) => !!p)),
    );
    if (from !== epoch) return new Map<string, Entry>();
    for (const id of todo) {
      const entry = cache.get(id);
      if (entry) result.set(id, entry);
    }
    todo = todo.filter((id) => !result.has(id));
    force = false;
  }
  return result;
}
/**
 * Resolves covers for many units; see resolveEntries. Never returns a cover resolved under an
 * earlier access context, even if the context changes after resolveEntries settles.
 */
export async function resolveUnitCovers(
  ids: readonly string[],
  force = false,
): Promise<Map<string, UnitCover | null>> {
  const from = epoch;
  const entries = await resolveEntries(ids, force);
  const current = from === epoch;
  return new Map(
    [...new Set(ids)].map((id) => [
      id,
      current ? (entries.get(id)?.cover ?? null) : null,
    ]),
  );
}
/** Drops cached covers (after a change), voids their requests in flight and asks mounted views to resolve again. */
export function invalidateUnitCovers(ids: readonly string[]) {
  for (const id of ids) {
    versions.set(id, version(id) + 1);
    cache.delete(id);
    inflight.delete(id);
  }
  notify();
}
/**
 * Called by the AuthProvider with a key of the current principal and its access (empty when
 * signed out). Any change discards every private cover and hides covers already on screen.
 */
export function setUnitCoverAccess(key: string) {
  if (key === access) return;
  access = key;
  epoch++;
  cache.clear();
  inflight.clear();
  notify();
}
/** Test seam: forget every cached cover and the access context. */
export function clearUnitCoverCache() {
  access = "";
  epoch++;
  cache.clear();
  inflight.clear();
  versions.clear();
}
const EMPTY = new Map<string, UnitCover | null>();
/** Floor for the renewal timer, so it can never spin. */
const MIN_RENEW_DELAY_MS = 1_000;
/** After a failed resolution or renewal, a mounted view tries again after this delay. */
const RENEW_RETRY_MS = 20_000;
/** A URL re-signed after an error that fails again within this window keeps the fallback. */
const RETRY_WINDOW_MS = 30_000;
/**
 * Covers for the given units, batch-resolved once per id set and re-signed while mounted,
 * before the earliest URL expires. `reportError` is called by an <img> that failed: its unit
 * is re-signed (batched with other failures in the same tick). The retry belongs to the failing
 * URL, not to the asset: only a URL obtained by such a re-sign that fails again right away
 * keeps the fallback, until the next renewal brings a new URL.
 */
export function useUnitCovers(ids: readonly string[]) {
  const key = [...new Set(ids)].sort().join(",");
  const [state, setState] = useState({ key: "", epoch: -1, covers: EMPTY });
  const [revision, setRevision] = useState(0);
  const retried = useRef(new Map<string, { url: string; at: number }>());
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const from = epoch;
    const units = key.split(",");
    resolveEntries(units)
      .then((entries) => {
        if (!current || from !== epoch) return;
        const covers = new Map<string, UnitCover | null>();
        let renewAt = Infinity;
        for (const id of units) {
          const entry = entries.get(id);
          covers.set(id, entry?.cover ?? null);
          if (entry?.cover)
            renewAt = Math.min(renewAt, entry.expiresAt - RENEW_MARGIN_MS);
        }
        setState({ key, epoch: from, covers });
        // Resolving again re-signs only the entries that are due, in batches.
        if (renewAt !== Infinity)
          timer = setTimeout(
            () => setRevision((r) => r + 1),
            Math.max(renewAt - Date.now(), MIN_RENEW_DELAY_MS),
          );
      })
      .catch(() => {
        // Covers are decorative: any failure keeps the fallback, never breaks the page,
        // and the view tries again later instead of giving up until it remounts.
        if (!current || from !== epoch) return;
        setState({ key, epoch: from, covers: EMPTY });
        timer = setTimeout(() => setRevision((r) => r + 1), RENEW_RETRY_MS);
      });
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key, revision]);
  const reportError = useCallback((cover: UnitCover) => {
    const last = retried.current.get(cover.unitId);
    if (last?.url === cover.url && Date.now() - last.at < RETRY_WINDOW_MS) {
      setState((s) => ({ ...s, covers: new Map(s.covers).set(cover.unitId, null) }));
      return;
    }
    queue.current.add(cover.unitId);
    if (queue.current.size > 1) return;
    setTimeout(() => {
      const units = [...queue.current];
      queue.current.clear();
      const from = epoch;
      resolveUnitCovers(units, true)
        .then((covers) => {
          if (from !== epoch) return;
          const at = Date.now();
          for (const [id, c] of covers)
            if (c) retried.current.set(id, { url: c.url, at });
          setState((s) => {
            if (s.epoch !== from) return s;
            const next = new Map(s.covers);
            for (const [id, c] of covers) next.set(id, c);
            return { ...s, covers: next };
          });
        })
        .catch(() =>
          setState((s) => {
            if (s.epoch !== from) return s;
            const next = new Map(s.covers);
            for (const id of units) next.set(id, null);
            return { ...s, covers: next };
          }),
        );
    }, 0);
  }, []);
  return {
    covers: state.key === key && state.epoch === epoch ? state.covers : EMPTY,
    reportError,
  };
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
