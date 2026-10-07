# Unit Cover v1 — implementation contract and operations

Status: implemented on `feat/unit-cover-v1` (baseline `74daf5de241c512210a4145c49083d420fff4779`). Not production ready: the operational criteria below remain open.

## Ownership

The unit cover is a **Core/Unit** capability. Core owns the data, the private bucket, the RPCs, the image preparation helper and the Administration flow. Business modules (Audit) only consume `core.unit_covers` through `apps/web/src/core/unitCovers.ts` (`useUnitCovers`); they never upload, sign or decide ownership. Without an authorized ready cover, every surface keeps the existing monogram/colour fallback.

## Data model (migration `20261007120000_core_unit_cover_v1.sql`)

- `core.units` (append-only): `cover_asset_id uuid null`, `cover_position_x numeric(5,2) default 50`, `cover_position_y numeric(5,2) default 50`, both checked to 0–100.
- `core.unit_cover_assets`: `id`, `unit_id`, generated `object_key = units/<unit>/covers/<asset>.jpg`, `status` (`pending` → `ready` → `retired` → `purged`; or `pending` → `retired`), `mime_type` (`image/jpeg` only), `byte_size` (1 B–1 MiB), `width`/`height` (1–2560), `created_by`, `created_at`, `ready_at`, `retired_by`, `retired_at`, `purged_at`. A shape check binds timestamps to status; a trigger makes identity/metadata immutable and allows only the transitions above.
- Ownership: composite FK `core.units(id, cover_asset_id) → core.unit_cover_assets(unit_id, id)`, so a unit can only reference its own asset.
- Deferred constraint triggers (checked at commit) guarantee that a unit references only a `ready` asset and that every `ready` asset is its unit's current cover (at most one per unit). Replacement retires the old asset, readies the new one and repoints the unit in one transaction.
- No Data API access to `core.unit_cover_assets` (RLS enabled, no grants). Clients cannot write the new `core.units` columns (column-level grants are unchanged).

## Authorization

| Operation | Requirement |
| --- | --- |
| begin / confirm / cancel / remove / set position | `admin.unit.manage` on the unit (global or unit scope), checked revocation-safe after locking the unit row |
| confirm / cancel | additionally only the uploader (`created_by`) of the pending asset |
| batch read, Storage SELECT/sign | `core.unit_cover.read` **or** `admin.unit.manage` on the unit; ready current cover only |

`core.unit_cover.read` is a new Core permission granted by the migration to the system roles `platform_administrator`, `quality` and `quality_viewer`. Custom roles are not changed; administrators add it explicitly when needed. Sector-only assignments do not grant unit-wide cover access (same rule as other unit resources). Unknown IDs and unauthorized IDs receive the same `42501`.

## RPC contract (schema `core`)

| RPC | Notes |
| --- | --- |
| `begin_unit_cover_upload(p_unit, p_mime_type, p_byte_size, p_width, p_height) → (asset_id, object_key)` | Validates bounds; at most 5 live (< 1 h) pending uploads per unit. |
| `confirm_unit_cover_upload(p_unit, p_asset, p_position_x, p_position_y)` | Uploader's live pending asset of that unit; Storage object must exist with owner = caller, `size` = `byte_size`, `mimetype` = `image/jpeg`. Retires the previous cover, sets framing. Retry after success is a no-op. |
| `cancel_unit_cover_upload(p_asset)` | Pending → retired; idempotent; a confirmed cover cannot be cancelled. |
| `remove_unit_cover(p_unit, p_expected_asset)` | Retires the current cover and resets framing to 50/50; a different current cover → `40001`; already removed → no-op. |
| `set_unit_cover_position(p_unit, p_expected_asset, p_x, p_y)` | 0–100 each; stale/absent cover → `40001`. |
| `unit_covers(p_units uuid[])` | 0–100 IDs per call (`22023` otherwise); returns only authorized ready covers: `unit_id, asset_id, object_key, position_x, position_y, width, height, ready_at`. Never a URL. |

Deviations from the brief's names, with reason: `confirm` also receives `p_unit` (explicit ownership check: wrong unit is rejected) and the framing (the cover becomes visible already framed, atomically). `remove`/`set_position` receive `p_expected_asset` for optimistic concurrency, consistent with the repository's version checks. Confirm itself is last-writer-wins: an explicit new upload replaces whatever is current.

Auditability: asset lifecycle events are written to `core.system_audit_log` (`module=core`, `entity_type=unit_cover_assets`, actions `cover_upload_begin`, `cover_ready`, `cover_cancel`, `cover_retire`, `cover_purge`), without the object key. Pointer and framing changes are recorded by the existing `core.units` change trigger.

## Storage

Private bucket `unit-covers`: `public=false`, `file_size_limit=1048576`, `allowed_mime_types={image/jpeg}`. INSERT is allowed only for the upload operation into the caller's own live pending key with `admin.unit.manage`; SELECT (and therefore signing) only for the readable current ready cover. There are no UPDATE/DELETE policies: no overwrite, upsert, move, copy or client delete. Retiring or removing a cover immediately stops new authorized reads and new signatures for it. A signed URL already issued is a bearer URL and stays valid until its TTL expires (currently ~300 s); this is inherent to the signed URL model, and clients drop it from their cache as soon as they learn of the change. The user's original file is never stored.

## Client

- `core/unitCoverImage.ts` (`prepareCoverImage`): accepts JPEG/PNG/WebP **by magic bytes** (declared MIME/extension ignored), max 8 MiB input. Reads dimensions from the header and refuses > 16 384 px per side or > 40 MP before decoding. Decodes (EXIF orientation applied), flattens transparency on white, re-encodes JPEG with the longest side ≤ 2560 px, targeting ≤ 512 KiB (quality steps, then downscale) and never returning > 1 MiB. Re-encoding drops EXIF (including GPS). Any failure is a clear Portuguese message and nothing is uploaded.
- `core/unitCovers.ts`: upload sequence begin → Storage upload (`upsert:false`) → confirm; any failure after begin cancels the pending asset. Read path: `resolveUnitCovers` makes one `unit_covers` RPC and one `createSignedUrls` call per ≤ 100 units, TTL 300 s, in-memory cache only (never localStorage/sessionStorage/DB), re-signed 60 s before expiry and after invalidation; concurrent requests are shared. The cache is scoped to the access context reported by the `AuthProvider` (user, active flag, grants): any change (sign-in, sign-out, user switch, grant change) clears it, hides covers on screen and voids requests in flight; invalidation also voids in-flight results for those units, so an older response can never restore a replaced/removed cover. A mounted `useUnitCovers` re-signs on its own before the earliest URL expires (only due units, batched). A failed image is re-signed (failures in the same tick are batched); a URL obtained by that re-sign which fails again within 30 s keeps the fallback until the next renewal, so a later failure can still recover without an error loop.
- Administration (`Unidades` → `Capa`): preview of card and page framing (`object-fit: cover; object-position: x% y%`), text description, labelled 0–100 sliders (keyboard operable), add/replace/save/cancel/remove with inline confirmation, live status for preparing/sending/confirming, single-flight saves. The file input has no `capture` attribute, so phones offer their normal gallery/camera/files choices.
- Audit: `UnitCover` renders the photo inside the existing slot above the brand fallback, with a stronger scrim and text shadow for legibility. The overview resolves all monitored units in one batch; the unit page resolves its unit.

## Operations

Reconciliation (operator only, no client grant): `select * from private.unit_cover_reconciliation();` reports `expired_pending`, `retired_object_retained`, `ready_missing_object` and `orphan_object`.

**Purge is disabled.** There is no automatic or client deletion of objects. Retired and orphan objects are retained until a retention decision exists: effective retention ≥ max(7 days, operational recovery window). Because the recovery window is not yet defined, any physical removal must wait for that decision and then follow an audited Storage runbook (Storage API with service credentials, then `status='purged', purged_at=now()`); it is not implemented in this version.

## Operational criteria (open)

1. **`X-Content-Type-Options: nosniff`** must be sent when the real serving environment returns cover objects. The local Supabase Storage stack does **not** send it (verified by `tests/integration/unit-cover.mjs`), and it cannot be guaranteed from repository code. Validate and configure it at the gateway/proxy of the real environment.
2. Bytes are not decoded server-side: the database stack cannot inspect pixels. The server enforces type/size through the bucket, size/MIME/owner match on confirm, bounded dimensions and canonical keys; width/height are client-declared (bounded) values. Content remains untrusted and is served only as `image/jpeg` from a private bucket via short-lived signed URLs.
3. Backups must include the `unit-covers` bucket alongside `core.unit_cover_assets`; restore order follows the existing Storage/metadata guidance.
4. Manual device checks (real iOS Safari / Android Chrome gallery and camera, HEIC behaviour) are not covered by automation.

## Validation

- `tests/unit-cover-database.test.ts` (PGlite): schema, FKs/checks, permission grants (including a custom role existing before the migration), unauthorized reads/writes, begin/confirm/cancel/remove/position, lifecycle invariants, batch limits and isolation, Storage policy predicates, reconciliation and audit log.
- `tests/unit-cover-image.test.ts`, `tests/unit-cover-client.test.ts`, `tests/unit-cover-admin.test.tsx`, `tests/unit-cover-audit.test.tsx`: preparation, batching/caching, Admin flow and Audit consumption (no N+1).
- `tests/integration/unit-cover.mjs`: real local Supabase Auth/PostgREST/Storage (upload, bucket limits, overwrite denial, batch signing with TTL 300, exact bytes, cross-unit denials, retire/remove).
