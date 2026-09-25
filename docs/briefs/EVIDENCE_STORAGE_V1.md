# Implementation Brief — Evidence / Storage v1

Status: CLOSED FOR IMPLEMENTATION  
Date: 2026-09-25  
Baseline: `main` at or after `00c05d529eab8ce2b77507a252ce38c004d0248f`

> This brief adds the first real binary evidence support to the platform, scoped to **Qualidade > Planos de Ação**. It defines ownership, data model, lifecycle, authorization, the Storage contract, file safety rules, UX states, audit, recovery expectations and tests. Production Storage/R2 provisioning, other modules and advanced file features remain separate work.

## Objective

At the end of this brief, an authorized user must be able to:

- attach a file as **execution evidence** of an Action Plan;
- attach a file as **verification evidence** of an Action Plan's effectiveness check;
- list the evidence of a plan they can read;
- download/open an evidence file they can read;
- remove evidence when their permission and the plan lifecycle allow it;
- do all of this on desktop and mobile;

while:

- bytes never enter PostgreSQL;
- bytes go only through the Supabase Storage API;
- metadata, ownership and lifecycle live in the Action Plans module;
- the browser never receives privileged credentials;
- every decision is enforced by the database/Storage boundary, not the UI;
- sensitive evidence mutations are recorded in `core.system_audit_log`.

## Required reading

- `AGENTS.md`
- `docs/architecture/SECURITY.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/BACKUP_RECOVERY.md`
- `docs/decisions/ADR-004-platform-stack.md`
- `docs/briefs/ACTION_PLAN_DOMAIN_V1.md`
- migrations `0006` and `0007` (Action Plans)
- `apps/web/src/modules/action-plans/`
- `tests/action-plans-database.test.ts`, `tests/integration/action-plans.mjs`

Do not load unrelated module documentation.

## 1. Domain and ownership

Decision: **metadata lives in the existing `action_plans` schema**, in one new table `action_plans.evidence`. Trusted helpers live in `action_plans_private`.

Rationale:

- `DATA_MODEL.md` rules out a universal polymorphic attachment table until cross-module use proves it; each module owns its attachment metadata under a shared storage contract.
- Evidence has no meaning outside a plan: its authorization, lifecycle and verification lock all derive from `action_plans.plans`. A dedicated `evidence` schema would need to reach into Action Plans internals to authorize anything, which is the coupling ADR-002 forbids.
- One table + a small set of RPCs reuses the existing `action_plans_private.authorize` / lock / log patterns from 0006–0007. This is the smallest correct solution.

Relationship: `action_plans.evidence.plan_id -> action_plans.plans(id)`, many evidence rows per plan, no cascade (plans are never deleted in v1).

Core owns nothing new. Core must not reference `action_plans.evidence`.

Supabase owns the `storage` schema. Action Plans may:

- create its bucket row and its `storage.objects` policies in its own migration;
- read `storage.objects` (bucket, name, owner, metadata) from its own trusted functions.

It must never insert/update/delete `storage.objects` rows directly with SQL; object bytes and object rows are changed only through the Storage API.

The shared **storage contract** defined in section 5 is written so a future module can own its own table and bucket under the same rules. Do not generalize code for that now.

## 2. Data model

### Categories: modeled explicitly

Decision: one table with an explicit `kind`:

- `execution` — "Evidência da execução": proof that the action was carried out;
- `verification` — "Evidência da verificação": material the verifier used to judge effectiveness.

A single untyped attachment list was rejected because the two kinds have **different authority and lifecycle**:

- execution evidence is a planning/execution fact → `action_plan.write`, frozen once the plan is verified (same rule as other execution facts);
- verification evidence is a verification fact → `action_plan.verify`, bound to the verification round it supports (section 3).

Without `kind`, a writer could remove the verifier's material, or a verifier's upload would be indistinguishable from execution proof. One column preserves the semantics at essentially zero cost. Do not add more kinds in v1.

Execution evidence needs no round: execution facts are frozen at the first verification and never change afterwards, so all execution evidence belongs to the single execution the plan records.

### `action_plans.evidence`

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `plan_id` | `uuid not null` | FK `action_plans.plans(id)` |
| `kind` | `text not null` | `check (kind in ('execution','verification'))` |
| `verification_round` | `integer` | `null` for `execution`; `>= 1` for `verification` (section 3, "Verification rounds"); set server-side, immutable |
| `object_key` | `text not null unique` | `generated always as (plan_id::text || '/' || id::text) stored` |
| `original_name` | `text not null` | validated display/download name (section 6); never used in the key |
| `content_type` | `text not null` | exact allowlist (section 7) |
| `size_bytes` | `bigint not null` | `check (size_bytes between 1 and 10485760)` |
| `status` | `text not null default 'pending'` | `check (status in ('pending','available','removed'))` |
| `created_by` | `uuid not null` | FK `core.profiles(id)`, `default auth.uid()` — the uploader |
| `created_at` | `timestamptz not null default now()` | upload intent (begin) time |
| `uploaded_at` | `timestamptz` | set by trusted confirmation |
| `removed_by` | `uuid` | FK `core.profiles(id)` |
| `removed_at` | `timestamptz` | |

Shape constraint:

```text
status='pending'   -> uploaded_at is null     and removed_by/removed_at are null
status='available' -> uploaded_at is not null and removed_by/removed_at are null
status='removed'   -> uploaded_at is not null and removed_by/removed_at are not null

kind='execution'    -> verification_round is null
kind='verification' -> verification_round is not null and verification_round >= 1
```

### `action_plans.plans` addition

One column, added by migration 0008:

| Column | Type | Rule |
|---|---|---|
| `verification_round` | `integer not null default 0` | number of verifications recorded for the plan; `check (verification_round >= 0 and (verification_round = 0) = (effectiveness is null))` |

- Incremented by 1 inside `verify_plan` on every verification and re-verification (the function is replaced in 0008 with the same signature and grants; all other behavior unchanged).
- Never client-writable (no direct UPDATE grant exists; `update_plan`/`set_plan_status` do not touch it).
- Deterministic backfill for plans already verified before 0008: the number of `verify`/`re_verify` events for that plan in `core.system_audit_log` (`module = 'action_plans'`, `entity_type = 'plan'`), with a minimum of 1 when `effectiveness is not null`; `0` otherwise. No evidence exists before 0008, so the backfill only aligns future round numbers with the audit trail.

Indexes:

- unique `object_key` (Storage policies look up by it);
- `(plan_id, kind, created_at)` where `status = 'available'`;
- `(plan_id)` where `status = 'pending'` (limit counting).

Deliberately **not** included:

- `unit_id`/`sector_id`: derived from the plan, whose scope is immutable;
- checksum/hash: the only value available without server compute would be client-computed and unverifiable; Storage already records size and ETag. Revisit if dedupe or integrity attestation becomes a requirement;
- removal reason, description/caption, version chain: no concrete need in v1;
- binary payloads of any kind.

Evidence mutations **do not** change `plans.version`. Attaching a photo must not create an edit conflict for someone editing the plan text. Serialization with verification is handled by row locks (section 13). (`verify_plan` itself still bumps `version` as today.)

## 3. Lifecycle

```text
begin_evidence_upload ──> pending ──(Storage upload)──> confirm_evidence_upload ──> available ──> remove_evidence ──> removed
            │                                                   │
            └── not confirmed within 1 hour: expired (inert) ───┘
```

### Upload (two-phase)

1. **Begin** — RPC `action_plans.begin_evidence_upload(p_plan uuid, p_kind text, p_original_name text, p_content_type text, p_size bigint)` returns `(evidence_id uuid, object_key text)`:
   - lock the plan row `for update` (not found → `42501`);
   - `action_plans_private.authorize(<permission for kind>, unit, sector)`;
   - check lifecycle rules (below);
   - validate name, type, extension↔type match and size;
   - enforce the per-plan limit (section 8);
   - insert a `pending` row; actor/time server-side; for `verification`, `verification_round = plans.verification_round + 1` (the open round).
   - No audit event: a pending row has no business effect.
2. **Upload** — the browser uploads the file with the user's session through `client.storage.from('action-plan-evidence').upload(object_key, file, { contentType: <canonical MIME>, upsert: false, cacheControl: '0' })`. Storage enforces bucket type/size limits and the `storage.objects` INSERT policy.
3. **Confirm** — RPC `action_plans.confirm_evidence_upload(p_evidence uuid)`:
   - resolve plan; lock plan `for update`; authorize for the kind; lock evidence row `for update`;
   - caller must be `created_by` (otherwise `42501`);
   - if already `available` → return success (idempotent, no second audit event);
   - reject if `removed`, or `pending` older than 1 hour;
   - re-check lifecycle rules (including, for `verification`, that its round is still open);
   - require a `storage.objects` row with `bucket_id = 'action-plan-evidence'`, `name = object_key`, `owner_id = auth.uid()::text`, `metadata->>'size' = size_bytes`, `metadata->>'mimetype' = content_type`;
   - set `status = 'available'`, `uploaded_at = clock_timestamp()`;
   - write the `evidence_add` audit event.

### Lifecycle rules by kind

| Operation | `execution` | `verification` |
|---|---|---|
| begin / confirm | `action_plan.write`, plan **not verified** (`effectiveness is null`), any status | `action_plan.verify`, plan `status = 'completed'`, evidence round **open** (`evidence.verification_round = plans.verification_round + 1`) |
| remove | `action_plan.write`, plan **not verified** | `action_plan.verify`, evidence round **open** |
| read / download | `action_plan.read` | `action_plan.read` |

Consequences:

- After verification, execution evidence is frozen, consistent with "Verified plan is locked" for ordinary writes (`55000`).
- Verification evidence of a round that has been recorded is frozen (`55000`): no add, confirm or remove.
- Evidence is **optional**: no attachment is required to move to `in_progress`/`completed` nor to verify or re-verify. `expected_evidence` and `verification_notes` remain valid ways to record non-file proof (e.g. "checklist físico conferido no local").
- If a completed, unverified plan returns to `in_progress`, open-round verification evidence is kept; adding more requires `completed` again.
- Checklist source activation/deactivation does not affect evidence.

### Verification rounds

Problem: `action_plans.plans` holds only the **current** verification; earlier verifications survive only as `verify`/`re_verify` before/after snapshots in `core.system_audit_log`. If verification evidence were a cumulative plan-level list, after two verifications it would be impossible to say which files supported which verification, and removals after the first verification could silently rewrite its basis.

Decision: bind each verification evidence to a **verification round** — the smallest model that removes the ambiguity without a verification-history subsystem.

- Round `n` = the `n`-th recorded verification of the plan (`1` = first `verify`, `2` = first `re_verify`, …).
- The open round of a plan is always `plans.verification_round + 1`. Verification evidence is attached only to the open round.
- `verify_plan` records the open round: it increments `plans.verification_round` in the same transaction that writes the verification fields. From that moment the round's evidence is closed and immutable.
- After a verification, new verification evidence belongs to the next round and becomes the basis of a possible re-verification. Existing evidence of earlier rounds is never moved, re-labeled or removed through the app.
- A pending upload whose round closed before confirmation is rejected at confirm (round no longer open) and becomes an orphan handled by reconciliation.

Historical traceability:

- Evidence → verification: `(plan_id, verification_round)`.
- Verification details of round `n` (result, date, notes, verifier) = `plans` when `n = plans.verification_round`; otherwise the `verify`/`re_verify` audit event whose `after_data.verification_round = n`. Every such event already stores `to_jsonb(plan)`, which now includes the round.
- Open-round evidence (`round = plans.verification_round + 1`) is material gathered for a verification that has not happened yet.

Why not cumulative plan-level evidence: it is smaller by one column but violates the requirement that each verification's basis is determinable and stable. Why not a verifications table: it would duplicate the audit trail's snapshots and add a second source of truth for verification facts; the round integer is enough to join evidence to the existing snapshots.

### Read / download

- List: RPC `action_plans.plan_evidence(p_plan uuid)` (security definer, `stable`) returns only `available` rows of plans where `private.has_scoped_permission('action_plan.read', unit, sector)`, with `id, plan_id, kind, verification_round, object_key, original_name, content_type, size_bytes, created_by, uploader display name, uploaded_at`, ordered `kind, verification_round, uploaded_at, id`. Display names are joined here because the reader may lack `admin.user.read` (same pattern as `plan_summaries`).
- Download: the browser calls `createSignedUrl(object_key, 60, { download: original_name })`. Storage evaluates the `storage.objects` SELECT policy at signing time.

### Removal: logical

Decision: **logical removal only** in v1.

RPC `action_plans.remove_evidence(p_evidence uuid)`:

- resolve plan; lock plan `for update`; authorize for the kind; lock evidence `for update`;
- `pending` or unknown → `42501`/not found semantics (no information leak);
- already `removed` → success, no-op, no second audit event;
- apply lifecycle rule; set `removed`, `removed_by`, `removed_at`; write `evidence_remove`.

Logical removal is immediate. The object stays in the bucket, but removed evidence disappears from listing and can no longer be signed/downloaded through the app (Storage SELECT policy requires `available`). The row and the Core audit log keep the history.

### Purge (physical deletion)

- No automatic purge in v1 and **no retention period** is defined; one will be set only when a legal/business requirement is closed.
- Physical deletion is possible only through an explicit **operational procedure**:
  - applies only to evidence already logically `removed` (an `available` item is first removed through the app/RPC);
  - requires an explicit, recorded authorization (e.g. ticket/decision reference) before execution;
  - deletes the object through the Storage API with operator credentials (never by deleting `storage.objects` rows with SQL);
  - records `evidence_purge` in `core.system_audit_log` with the operator identity and the authorization reference in `metadata`.
- The evidence row is kept with status `removed` after purge; no new status is needed. Reconciliation does not report removed rows without an object.
- No client, RPC or scheduled path deletes objects in v1. The procedure is documented in the runbook as a production gate.

### Replacement

No replace operation. Replacement = add the new file + remove the old one; both are audited. No object is overwritten (`upsert: false`, unique keys, no UPDATE policy), so object keys are write-once.

### Orphans and partial failures

| Failure | Resulting state | Handling |
|---|---|---|
| begin OK, upload never happens | `pending` row, no object | inert after 1 hour; not listed; not counted |
| upload OK, confirm never arrives | `pending` row + object | client retries confirm; after 1 hour: orphan object, reported by reconciliation |
| confirm committed, response lost | `available` | client retry of confirm is idempotent |
| upload retried after a lost success response | Storage returns "already exists" | client proceeds to confirm |
| confirm rejected (mismatch, lock, revocation) | `pending` + object | UI error; reconciliation reports after expiry |
| `available` row whose object is missing (backend loss/restore) | download fails | UI shows "Arquivo indisponível"; reconciliation reports |
| object without any evidence row | invisible to users | reconciliation reports |

Reconciliation: a private function `action_plans_private.evidence_reconciliation()` (not executable by `anon`/`authenticated`) returns rows `(issue, evidence_id, object_key, detail)` for:

- `expired_pending` (with whether an object exists);
- `available_missing_object` (no `storage.objects` row);
- `orphan_object` (object in the bucket with no evidence row).

v1 delivers the function, tests and a short operator note in the migration/test comments. Deleting reported orphans is an operator action through the Storage API. Scheduling it is a production concern (out of scope). The function sees Storage metadata only; detecting a backend object lost while its `storage.objects` row survives requires a Storage HEAD/download check during restore tests (section 11).

## 4. Authorization

- **No new permission key.** `action_plan.read`, `action_plan.write` and `action_plan.verify` already express every boundary needed: read vs execution facts vs verification facts. Adding `action_plan.evidence.*` would create a combination (e.g. may upload but not edit the plan) with no business case.
- Scope semantics are exactly the plan's: `sector_id is null` → unit-wide; otherwise exact sector; global covers all; sector-only assignments never cover unit-wide plans. Use `private.has_scoped_permission(permission, plan.unit_id, plan.sector_id)`.
- Mutations follow the 0007 pattern: lock target rows first, then `action_plans_private.authorize`, then lifecycle checks, so a revocation committed during a wait is observed.
- `write` does not imply `verify` and vice versa, also for evidence.
- Anonymous and inactive profiles are denied everywhere.

### Guessed identifiers

- Unknown plan, unreadable plan and forbidden plan all return `42501 Forbidden` from RPCs.
- Unknown, other-user pending, or unauthorized evidence all return `42501`.
- Storage policies check the metadata row **and** the caller's permission; knowing or guessing an `object_key` grants nothing.

### Database surfaces

- `action_plans.evidence`: RLS enabled; `grant select` to `authenticated` with policy `status = 'available' and exists(plan where has_scoped_permission('action_plan.read', unit, sector))`; **no** INSERT/UPDATE/DELETE grants.
- RPCs `begin_evidence_upload`, `confirm_evidence_upload`, `remove_evidence`, `plan_evidence`: `security definer`, `set search_path = ''`, fully qualified names, `execute` granted only to `authenticated`.
- Private helpers (Storage policy predicates, logging, reconciliation): no `execute` for `public`/`anon`/`authenticated` except where a policy predicate must be callable by `authenticated` — then keep it narrow and side-effect free.

RLS and the Storage policies remain authoritative; UI visibility is convenience only.

## 5. Storage contract

### Bucket

- One private bucket: `action-plan-evidence` (`public = false`).
- `file_size_limit = 10485760` (10 MiB).
- `allowed_mime_types` = exactly the section 7 list.
- Created in migration 0008 by inserting into `storage.buckets`. The PGlite test harness must provide a minimal `storage` stub (buckets/objects with the columns used) before applying migrations; real behavior is proven in the integration test.

### Object naming

```text
<bucket>/<plan_id>/<evidence_id>
```

- Only UUIDs; no user-supplied text, no extension (also avoids extension-based CDN caching).
- The key is a generated column; clients cannot choose it.

### `storage.objects` policies (bucket-restricted)

- **INSERT** to `authenticated`: `bucket_id = 'action-plan-evidence'` and a trusted predicate confirming a `pending` evidence row with `object_key = name`, `created_by = auth.uid()`, created less than 1 hour ago, the caller still holding the kind's permission on the plan scope, and lifecycle still allowing it.
- **SELECT** to `authenticated`: `bucket_id = 'action-plan-evidence'` and a predicate confirming an `available` evidence row with `object_key = name` on a plan where the caller has `action_plan.read`.
- **UPDATE / DELETE**: no policies (denied). No upsert, move, copy or client deletion.

### Upload and download

- Upload uses the user's JWT via `supabase-js` Storage. Single standard upload; no TUS/resumable in v1.
- `contentType` is always the canonical MIME from the allowlist, never `File.type` directly.
- `cacheControl: '0'` so evidence is not cached by intermediaries.
- Download uses **short-lived signed URLs** (60 seconds), requested at click time, with `download = original_name` so Storage answers with `Content-Disposition: attachment`.
- Signed URLs are never persisted, logged, put in audit payloads, sent to telemetry or placed in app routes.
- Residual risk accepted: a signed URL remains valid for its 60 seconds even if access is revoked in that window.

### Credentials and environments

- Browser: only the publishable/anon key + user session (existing `core/client.ts`). Never a service-role key, S3/R2 access key or Storage secret.
- Application code talks **only** to the Supabase Storage API. It never calls S3/R2 directly, so local (file backend) and production (R2 S3 backend) share one contract.
- Evidence must be served from the Supabase API host, never from the application origin.
- Local development: `supabase/config.toml` storage settings may be adjusted for local use only; the integration CI job must stop excluding `storage-api` (keep `imgproxy` excluded).

## 6. Security

### Type validation

- Source of truth for the accepted type: the **declared canonical MIME**, which must be in the allowlist **and** match the file extension mapping; enforced by the RPC (authority) and by the bucket `allowed_mime_types` (Storage boundary).
- Extension alone is never trusted: the client also checks magic bytes before upload (JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; PDF `%PDF-` within the first 1024 bytes; XLSX/DOCX ZIP `50 4B 03 04`) and rejects mismatches.
- Known limit: without a server compute layer, the server cannot inspect bytes in v1. A client bypassing the UI can upload arbitrary bytes under an allowed MIME. Mitigations, all mandatory:
  - stored `Content-Type` is always an allowlisted non-active type;
  - downloads always use `Content-Disposition: attachment`;
  - served from the API host, not the app origin;
  - no inline rendering in the app (no `<img>`, `<iframe>`, `<object>` of evidence in v1);
  - uploaders are authenticated, scoped, audited users.

### Always rejected

Everything not in section 7, explicitly including: legacy Office `xls`/`doc`; macro-enabled Office `xlsm`/`docm` (and other OOXML variants such as templates/binary workbooks); SVG, HTML/XHTML, XML, JS; any executable/script/installer (`exe`, `msi`, `bat`, `cmd`, `ps1`, `sh`, `vbs`, `jar`, `apk`…); archives (`zip`, `rar`, `7z`); HEIC and other image formats.

### Filename handling

The name is display/download metadata only. Rules (client normalizes for UX; the RPC validates and **rejects**, never silently rewrites):

- Unicode NFC;
- basename only: nothing up to the last `/` or `\` is accepted — names containing `/` or `\` are rejected;
- no C0/C1 control characters, no DEL, no CR/LF;
- no bidi/format controls (`U+200E`, `U+200F`, `U+202A–U+202E`, `U+2066–U+2069`);
- none of `: * ? " < > |`;
- no leading `.`; no trailing space or `.`;
- 1–180 characters including extension;
- must end with an extension from section 7 that maps to the declared `content_type` (case-insensitive). `laudo.exe.pdf` is a PDF; `laudo.pdf.exe` is rejected.

The client proposes a normalized name (e.g. replacing forbidden characters with `_`); the user never needs to rename manually for common cases. Rendered as React text (escaped). Validate that non-ASCII names (`Relatório ação.pdf`) survive the `download` round trip.

### Headers and caching

- Expect `Content-Type` = stored MIME, `Content-Disposition: attachment`.
- The integration test must record whether Storage sends `X-Content-Type-Options: nosniff` and the effective `Cache-Control`. If `nosniff` is absent, adding it at the gateway/edge becomes a **production gate** (not implemented here).
- Production gate: CDN must not cache Storage responses for evidence.

### Per-format notes

- **Images (JPEG/PNG):** original bytes preserved; no re-encoding, compression or metadata stripping. See "Known privacy risk: EXIF/GPS" below.
- **PDF:** may contain scripts/links; opened only as a download by the user's viewer. Accepted.
- **XLSX/DOCX:** OOXML ZIP containers. The server cannot distinguish them from other ZIP-based formats (including a renamed `xlsm`/`docm`) by bytes in v1; this residual risk is covered by the same mandatory mitigations above and by the Office/endpoint protections applied to downloaded files.

### Known privacy risk: EXIF/GPS

- Photos taken on phones commonly embed EXIF metadata, possibly including GPS coordinates, device and timestamp.
- v1 preserves the original bytes: whoever may download the evidence can read that metadata.
- The application does **not** parse, extract, index or copy EXIF/GPS into the database, audit log or any other place.
- Removing EXIF is out of scope (it requires re-encoding). Accepted as a known risk for an internal, access-controlled, audited store; revisit before sharing evidence outside the authorized scope or if a privacy requirement demands it.

### Malware handling (proportional)

No antivirus scanning in v1. Justification: uploaders are authenticated internal users with scoped permissions; the allowlist excludes executables, scripts, archives and macro formats; files are never executed or rendered by the platform; endpoint protection applies on download. Revisit (e.g. an asynchronous scan with quarantine status) before accepting uploads from external parties or broader file types.

### Errors

User-facing messages must not expose object keys, bucket names, SQL or Storage internals.

## 7. Allowed file types (v1)

| Extensions | Canonical MIME |
|---|---|
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.pdf` | `application/pdf` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

This list is closed for v1. Excluded:

- **XLS/DOC (legacy):** binary OLE compound files. They cannot be identified by a simple signature (the OLE header is shared by many unrelated formats), rely on complex legacy parsers, and have no business need that current Office cannot meet by saving as XLSX/DOCX/PDF.
- **XLSM/DOCM and other macro-enabled or non-document OOXML variants:** active content has no evidence purpose; excluded by type allowlist and extension rules.
- **HEIC:** poor browser/desktop support for viewing and no server-side conversion in v1. iOS Safari normally transcodes photos to JPEG when the file input does not accept HEIC; this must be verified on a real iPhone (manual check). If a HEIC file still arrives, it is rejected with a clear message.
- CSV/TXT and everything else: no concrete need yet.

The `<input type="file">` `accept` attribute lists these extensions and MIME types. It is a convenience, not a control.

## 8. Limits

- **10 MiB per file.** Phone photos (typically 2–6 MB JPEG) and ordinary PDFs/Office files fit; single-request uploads on mobile networks stay reliable without a resumable protocol; it keeps the Storage/backup footprint predictable. Enforced by the RPC and by the bucket.
- **20 active evidence items per plan.** "Active" = `available` + non-expired `pending`, across both kinds and all verification rounds (frozen historical evidence counts). Enforced by `begin_evidence_upload` under the plan row lock.
  - `removed` items do not count: otherwise correcting wrong uploads would permanently consume the quota until an operator purge. Their objects remain stored (no purge in v1); remove/re-add churn is bounded by permission and every step is audited. Accepted residual.
  - Expired pending items do not count.
- Pending expiry: **1 hour**.
- Signed URL TTL: **60 seconds**.

## 9. Functional UX

No redesign. Reuse existing shared UI/dialog components and styles.

Placement in the plan detail (`ActionPlanPage`):

- **"Evidências da execução"** inside/after "Planejamento / execução";
- **"Evidências da verificação"** inside/after "Verificação realizada", grouped by round:
  - open round, labeled "Para a próxima verificação" (or "Para a verificação" when never verified) — the only group with add/remove;
  - recorded rounds, labeled "Verificação nº n", newest first, read-only; the current round shows next to the current verification data;
- the verification form shows the execution evidence and the open-round verification evidence, next to the criterion and expected evidence, so the verifier sees exactly what this verification will be bound to.

Each section:

- list items: name (wraps/ellipsizes without horizontal scroll), type label (Imagem, PDF, Planilha, Documento), size, uploader, upload date/time;
- **Baixar** per item;
- **Remover** per item only when permission + lifecycle allow; confirmation via application dialog (no native `confirm`);
- **Anexar arquivo** only when permission + lifecycle allow; one file per action; opens the native file chooser (camera/gallery/files on mobile; no `capture` attribute so the user may choose).

Notes shown near the button: accepted formats and 10 MB limit.

States:

- loading list; empty ("Nenhuma evidência anexada."); list fetch failed with retry;
- uploading: button disabled with "Enviando…" announced (`aria-live`); no percentage progress in v1 (standard upload API has no progress events; 10 MB cap keeps waits short);
- client-side rejection before upload: type not allowed, file too large, invalid name, empty file;
- server errors mapped to messages: no permission (`42501`), plan verified/locked (`55000`), limit reached, upload expired, network failure (retry keeps the same `evidence_id`: re-upload if needed, then confirm);
- removal in progress / removed;
- download: "Arquivo indisponível" if signing or fetching fails.

Mobile:

- usable at 375px, no mandatory horizontal scroll, adequate touch targets;
- download must not rely on `window.open` after an `await` (popup blockers); use same-tab navigation / programmatic anchor with the signed URL;
- validate on iOS Safari and Android Chrome (manual).

Data access lives in the Action Plans module (e.g. `evidence.ts` for RPC/Storage calls and client validation, one presentational component). No raw Storage calls scattered across components.

## 10. Audit trail

Written by trusted functions to `core.system_audit_log` with `module = 'action_plans'`, `entity_type = 'evidence'`, `entity_id = evidence id`, `unit_id`/`sector_id` from the plan:

- `evidence_add` — at successful confirmation;
- `evidence_remove` — at logical removal;
- `evidence_purge` — operator procedure only, with operator identity and authorization reference in `metadata`.

Replacement appears as `evidence_add` + `evidence_remove`.

Payload (before/after) is a safe projection: `id, plan_id, kind, verification_round, original_name, content_type, size_bytes, status, created_by, uploaded_at, removed_by, removed_at`. Metadata: `{"plan_id": ..., "kind": ..., "verification_round": ...}`.

The existing `verify`/`re_verify` plan events carry `verification_round` in their plan snapshot, which is the join key between a round's evidence and that verification's recorded facts.

Never log: bytes, signed URLs, tokens, Storage/S3 credentials, object key (derivable from ids; not needed).

Begin, idempotent repeats and failed attempts are not audited.

## 11. Backup and recovery

- R2 (or any object backend) is **not** a backup by being off-host. Production requires an independent, access-separated copy of evidence objects (production gate; mechanism decided with the production infrastructure brief).
- Metadata (`action_plans.evidence`, `storage.objects`) is covered by the existing PostgreSQL backup/PITR plan.
- v1 guarantees that make restore consistency simple:
  - object keys are write-once (no overwrite, no client delete);
  - removal is logical;
  - purge happens only through the audited operational procedure;
  - therefore an object copy taken **at or after** the database restore point is a superset of the objects the restored metadata references (except purged objects, which are only ever `removed` rows and identifiable from `evidence_purge` events).
- Restore procedure expectation: restore DB to T → restore objects from a copy taken ≥ T → run `evidence_reconciliation()` → sample downloads through the Storage API for `available` rows → orphan objects newer than T are reported, not deleted automatically.
- Restore tests must include evidence download checks, per `BACKUP_RECOVERY.md`.
- Object-copy frequency/retention and RPO/RTO are not set here.

## 12. Tests

Do not claim any of these passed unless executed.

### Database / RLS (PGlite with `storage` stub, plus real Postgres where concurrency is involved)

1. `action_plans.evidence` exists, RLS enabled, no INSERT/UPDATE/DELETE grants to `authenticated`; private helpers not executable by clients.
2. `kind` accepts exactly `execution`/`verification`.
3. content-type allowlist is exact; extension↔MIME mismatch rejected; `.xls`, `.doc`, `.xlsm`, `.docm`, `.heic`, `.svg`, `.html`, `.exe`, `.zip` rejected.
4. size `0` and `10485761` rejected; `10485760` accepted.
5. malicious names rejected: `../x.pdf`, `a\b.pdf`, CR/LF, NUL, bidi override (`fdp‮fdp.pdf`), `"a".pdf`, leading dot, trailing dot/space, 181 chars, no extension, `x.pdf.exe`; `x.exe.pdf` accepted as PDF.
6. `object_key` equals `plan_id/id` regardless of the name.
7. execution begin/confirm/remove require `action_plan.write`; verification begin/confirm/remove require `action_plan.verify`; `write` does not grant verification evidence and `verify` does not grant execution evidence.
8. listing/table SELECT require `action_plan.read`: global OK; matching unit OK; different unit denied; matching sector OK; sector-only denied for unit-wide plan.
9. guessed plan id and guessed/foreign evidence id return `42501`, indistinguishable from not found.
10. anon and inactive profile denied on every RPC and on table SELECT.
11. confirm: non-uploader denied; missing object rejected; size or MIME mismatch rejected; expired pending rejected; second confirm is a no-op without a second audit event.
12. `pending` and `removed` rows are not listed nor selectable.
13. verified plan: execution begin/confirm/remove rejected (`55000`).
14. verification evidence begin requires `status = 'completed'` and is assigned `verification_round = plans.verification_round + 1`; the client cannot choose the round; execution rows have `null` round (constraint).
15. per-plan limit is 20 counting `available` + live `pending` across kinds and rounds; `removed` and expired pending not counted.
16. Storage policies (stub): INSERT only for own live pending key in the bucket; other bucket, other key, other user's key, expired key denied; SELECT only for `available` + read scope; no UPDATE/DELETE path.
17. `evidence_add`/`evidence_remove` events contain the safe projection and no object key/URL.
18. evidence mutations do not change `plans.version`.
19. reconciliation reports expired pending, available-without-object and orphan objects; does not report purged (`removed`) rows; not executable by `authenticated`.

### Verification rounds

19a. `plans.verification_round` starts at 0, becomes 1 on `verify`, 2 on the first `re_verify`; constraint `(round = 0) = (effectiveness is null)` holds; clients cannot write it.
19b. after `verify`, round-1 evidence cannot be added, confirmed or removed (`55000`); new verification evidence goes to round 2.
19c. after two verifications, each verification evidence maps to exactly one round, and each round maps to exactly one `verify`/`re_verify` audit event via `after_data.verification_round`.
19d. verify or re-verify without any evidence succeeds (evidence optional); completing a plan without evidence succeeds.
19e. backfill: plans verified before 0008 get the audit-event count (minimum 1); unverified plans get 0.
19f. existing Action Plan tests (verification, re-verification, stale version, `plan_summaries`) still pass with the replaced `verify_plan` and the new column.

### Concurrency (real Postgres sessions)

20. verification vs concurrent execution confirm/remove and vs open-round verification confirm/remove: serialized by the plan lock; after verification commits, those mutations fail (round closed / plan locked).
21. two concurrent removals of the same evidence: one `removed`, one no-op, exactly one audit event.
22. two concurrent begins at 19 active items: exactly one succeeds.
23. permission revoked while a mutation waits on the plan lock: mutation denied (0007 pattern).
24. two simultaneous uploads to the same plan by different users both succeed.

### Frontend (Vitest/jsdom)

25. client validation: type, magic bytes, size, name normalization.
26. sections and buttons follow permission + lifecycle (write-only, verify-only, read-only users; verified plan); verification evidence is grouped by round and only the open round offers add/remove.
27. upload flow: begin → upload with canonical MIME, `upsert: false` → confirm; "already exists" continues to confirm; errors mapped.
28. download requests a 60 s signed URL with the download name; the URL is not stored in state beyond the click nor logged.
29. removal uses the application dialog; no native `alert`/`confirm`/`prompt`.
30. 375px: long names wrap, no mandatory horizontal scroll.

### Real local Supabase integration (Storage enabled)

31. full flow as a real user: begin → Storage upload → confirm → list → signed download; response `Content-Type` = stored MIME, `Content-Disposition: attachment`; record `X-Content-Type-Options` and `Cache-Control`.
32. direct Storage upload bypassing the UI with a disallowed MIME or > 10 MiB is rejected by the bucket.
33. user of another unit cannot upload to a foreign pending key, cannot sign another unit's evidence, and a guessed key cannot be signed.
34. removed evidence cannot be signed.
35. interrupted upload: begin without upload → expired pending reported; upload without confirm → orphan reported after expiry.
36. object without metadata (uploaded with operator credentials outside the flow) → reported as orphan.
37. metadata without object (object deleted through the Storage API by the operator) → download shows unavailable; reconciliation reports.
38. Playwright at 375px: attach, list, download, remove.

### Manual

39. iOS Safari: photo from camera/gallery arrives as JPEG, not HEIC.
40. Android Chrome: camera/gallery/files attach and download.

### Existing validation commands

`npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run verify:build`, plus the integration job with `storage-api` enabled.

## 13. Concurrency

- **Lock order** for every evidence mutation: plan row `for update` → caller authorization rows (`action_plans_private.authorize`) → evidence row `for update`. Same order as `lock_plan`/`verify_plan`, so no deadlock with plan mutations.
- **Simultaneous uploads**: independent rows and keys; the plan lock is held only for the short begin/confirm transactions, never during byte transfer.
- **Concurrent removal**: evidence row lock; second remover sees `removed` → idempotent no-op.
- **Duplicate retry**: the client keeps `evidence_id` for the whole attempt; Storage "already exists" → confirm; confirm is idempotent. A retried begin only creates another pending row that expires.
- **Verification race**: `verify_plan` locks the plan `for update` and increments the round; evidence begin/confirm/remove take the same lock and recheck the open round, so an evidence change is either part of the round being recorded or is rejected after it.
- No optimistic `version` on evidence: rows are append/remove only, never edited.

## 14. Out of scope (v1)

- advanced preview, inline image/PDF viewers, thumbnails, galleries;
- OCR, compression, re-encoding, EXIF stripping or EXIF extraction;
- generic file versioning; a verification-history table (rounds + audit snapshots cover it);
- retention periods and automatic purge;
- antivirus/quarantine pipeline;
- comments/captions on evidence;
- evidence in Audit or any other module; a universal attachment table;
- multi-file/bulk upload, drag-and-drop, resumable uploads, upload progress percentage;
- offline upload;
- notifications;
- visible removed-evidence history in the UI (Core audit log covers it);
- physical deletion from the UI;
- new permission keys;
- production Storage/R2/Cloudflare provisioning, CDN/header rules, scheduled reconciliation, object backup copies, deployment, production secrets.

Do not create placeholders for these.

## 15. Migrations

- Start at **`<date>0008_action_plans_evidence.sql`** or later. Migrations 0001–0007 are immutable.
- One migration is expected: `plans.verification_round` column + deterministic backfill + constraint; `create or replace` of `action_plans.verify_plan` (same signature/grants, adds the increment); evidence table + constraints/indexes, RLS/grants, bucket row, `storage.objects` policies, RPCs, private helpers (policy predicates, logging, reconciliation).
- Validate that `plan_summaries` (which returns the `action_plans.plans` row type) and the frontend types handle the new column.
- Validate from zero on local Supabase **with `storage-api` running**, confirming that the migration's references to `storage.buckets`/`storage.objects` resolve and that the function owner can read `storage.objects`.
- No production migration execution.

## Production gates (recorded, not implemented)

Before evidence reaches production:

- R2 bucket + Storage S3 backend configured with least-privilege credentials held only by the Storage service;
- independent copy of evidence objects with separate credentials, and a tested restore including downloads;
- CDN caching bypass for Storage responses; `X-Content-Type-Options: nosniff` guaranteed at Storage or edge;
- reconciliation run on a schedule with alerting;
- operator purge procedure (authorization record, Storage API deletion, `evidence_purge` event) documented in the runbook.

## Product decisions (closed 2026-09-25)

1. **File types:** only JPEG/JPG, PNG, PDF, XLSX, DOCX. XLS, DOC, XLSM, DOCM, executables and all other formats excluded.
2. **Evidence is optional:** not required to complete a plan nor to verify/re-verify effectiveness; `expected_evidence` and `verification_notes` may represent non-file proof.
3. **Removed evidence:** immediate logical removal; no automatic purge in v1; object no longer accessible through the app; physical purge only by explicit, authorized, audited operational procedure; no retention period until a legal/business requirement exists.
4. **EXIF/GPS:** original bytes preserved; the application does not extract, index or copy EXIF/GPS; stripping out of scope; documented as a known privacy risk.
5. **Limits:** 10 MiB per file; 20 active evidence items per plan (section 8 semantics).
6. **Verification evidence:** bound to verification rounds; closed rounds immutable (section 3).

No open product decisions remain for v1.

## Acceptance criteria

- execution and verification evidence can be attached, listed, downloaded and removed per the permission/lifecycle table;
- bytes only in Storage; metadata only in `action_plans.evidence`;
- object keys contain no user input;
- guessed ids/keys grant nothing; unit/sector scope respected;
- verified plans freeze execution evidence;
- every verification evidence belongs to exactly one verification round and recorded rounds are immutable;
- allowlist, size, name and limit rules enforced server-side and at the bucket;
- downloads are attachment-only via 60 s signed URLs;
- add/remove audited with safe payloads;
- partial failures leave inert or reported state, never visible broken evidence;
- mobile flow usable;
- all required automated and local-Supabase validations pass;
- no production infrastructure change.

## Completion report

Return only:

1. main files changed;
2. migrations created;
3. tests/validation executed;
4. real pending issues;
5. commits.
