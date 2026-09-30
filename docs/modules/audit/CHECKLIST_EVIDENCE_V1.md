# Audit Checklist Evidence v1

Integrated in `main` by PR #11 at merge commit
`c3f135f6026899362e1edacda3e97e922528ac8e`. Migration:
`supabase/migrations/20260930114000_audit_checklist_evidence_v1.sql`.
This records the implemented contract and verified repository state, not production readiness or full Quality acceptance.
The completion matrix and foundation gates are maintained separately.

## Contract

Audit owns `audit.checklist_evidence` and private bucket `audit-checklist-evidence`.
The immutable composite FK binds each file to an actual `(inspection_id, item_key)`
answer. The server generates `<inspection_uuid>/<evidence_uuid>` keys with no user name
or extension. There is no Audit dependency on Action Plans; the neutral Shared file
validator is concretely used by both modules.

| RPC | Contract |
| --- | --- |
| `begin_checklist_evidence_upload(p_inspection,p_item_key,p_original_name,p_content_type,p_size)` | Authorizes draft/edit, validates metadata and reserves one pending slot; returns server ID/key |
| `confirm_checklist_evidence_upload(p_evidence)` | Uploader only, live pending, same lifecycle version, draft/edit; compares Storage owner/size/MIME metadata |
| `checklist_evidence(p_inspection,p_item_key default null)` | Available rows only, parent read; null item returns the whole inspection |
| `remove_checklist_evidence(p_evidence)` | Draft/edit logical removal; bytes retained; repeats emit no duplicate event |
| `checklist_evidence_pending_count(p_inspection)` | Read-authorized aggregate warning; exposes no pending IDs/keys/names |
| `finalize_inspection(p_id,p_version,p_expected_evidence_ids)` | Requires non-null whole-inspection IDs; sorted/distinct comparison under parent lock; mismatch `40001`; old two-argument overload removed |

Empty expected array is valid. Scoring and completeness are unchanged. Every successful
finalization logs the accepted available IDs. Re-finalization adds a new event and
preserves prior events. Begin/failure/retry produces no business evidence event;
successful confirm/remove logs use module `audit`, entity `checklist_evidence`, with
safe metadata and no bytes, object keys, signed URLs or credentials.

## Access and lifecycle

| Caller | List/sign/download | Begin/upload/confirm/remove |
| --- | --- | --- |
| Active global grant | Read required; draft or finalized | Edit required; draft only |
| Active correct-unit grant | Same | Same |
| Wrong-unit or sector-only grant | Denied | Denied |
| Anon, inactive profile, no grant | Denied | Denied |

Confirm additionally requires original uploader ownership; any authorized editor may
remove available evidence. Inaccessible/nonexistent IDs grant nothing and expose no
existence distinction. Mutation lock order is inspection `FOR UPDATE`, deterministic
Core authorization locks, then evidence row. Evidence never explicitly locks/updates
an answer; the composite FK takes only its compatible implicit key-share lock.

Reopen preserves available and removed records and grants no new capabilities.
Edit holders may change the current set again. A pending attempt from before a
finalize/reopen is invalid; begin a new attempt. Pending expires after one hour.
Quota: 10 active/criterion and 100/inspection; available plus live pending count,
removed/expired do not. Size 1–10,485,760 bytes. JPG/JPEG, PNG, PDF, XLSX and DOCX only;
canonical MIME and NFC basename contract are enforced in SQL.

## Storage and client

The browser uses the user's JWT and Storage API, `upsert:false`, `cacheControl:'0'`.
INSERT requires a live owned reservation, draft, matching lifecycle, edit permission
and Storage upload operation; COPY into another pending key is denied. No client
UPDATE/DELETE/upsert/move/copy. SELECT requires available/read.

Downloads sign for 60 seconds, check the actual bytes endpoint, then use an attachment
anchor without a popup or persisted URL. Missing files produce visible feedback.
Previously issued signed links can remain usable until their short expiry.

Audit UI lists filename/type/size/uploader/time per criterion, one-file upload,
sending/confirming/error/retry, application removal dialog and finalized read-only
state. Original bytes are preserved; there is no inline preview. Long names wrap.
Finalization fetches and displays a frozen full-inspection snapshot, warns about
pending transfers, binds the snapshot to parent/version, and requires reload/review
after an evidence conflict.

## E3 remains exactly the approved residual risk

Client magic-byte checks are bypassable. A ZIP signature cannot distinguish
XLSX/DOCX/macros/arbitrary ZIP content. SQL, bucket and confirmation validate metadata;
there is no trusted server byte parser, antivirus or sanitization. Files remain
untrusted. Original EXIF/GPS is preserved, never extracted; UI warns about it.
No HEIC conversion, quarantine service or malware infrastructure was added.

The approved acceptance still requires authenticated/scoped/audited uploaders,
attachment-only download, isolated API origin, canonical non-active MIME, no preview,
production nosniff/no-cache gates and endpoint protection. Repository tests do not
establish production header/cache guarantees.

## Reconciliation and recovery

Operator-only `audit_private.checklist_evidence_reconciliation()` reports expired
pending with/without an object, available rows missing Storage metadata and orphan
objects. App roles cannot invoke it. Operators must independently check actual bytes
through Storage API: matching SQL metadata cannot prove backend file existence.

Back up evidence rows, Core audit history, Storage metadata and independent object
copies. Restore DB to T and objects from a copy at/after T, reconcile in isolation,
then verify actual authorized downloads and wrong-unit denial. Object copies must
retain files physically purged after T throughout the DB recovery window.
The integration fixture exercises file loss/restoration, not a full production backup.

No automatic purge, retention interval or reconciliation schedule exists. Any future
physical purge requires recorded human authorization, Storage API deletion and a safe
operator audit event. Never delete Storage rows through SQL. Operational owner must
define backup access separation, retention, measured RPO/RTO, monitoring, restore and
purge procedures before release.

## Validation evidence and pending acceptance

`tests/audit-evidence-database.test.ts` covers SQL/PGlite; client/UI tests cover
file rules, transport and complete-set review. `tests/integration/audit-evidence.mjs`
is wired into the existing disposable Supabase/Chromium workflow, preserving all
Action Plans, Evidence, Reporting, Audit and Admin suites. It includes real JWT,
Storage bytes, bypass attempts, two-session PostgreSQL races, reconciliation/file
restore, desktop and 375px upload/download/retry/keyboard/overflow checks.

Initial development used only the authenticated GitHub connector. An independent
review later ran typecheck, lint, unit tests, build, verify:build, `npm audit --omit=dev`
and all six integration suites in workflow order against a freshly reset disposable
local Supabase (127.0.0.1) with Chromium; no linked project or production execution
occurred.

Repository CI evidence is recorded. PR #11 head `132771d54b0eae3781d72fb11746b12f28a84f0e`
passed the full pull-request workflow in run `36720376966`, attempt 2, before merge.
The post-merge `main` execution `36728754202` passed on
`c3f135f6026899362e1edacda3e97e922528ac8e`:
typecheck, lint, 18 test files / 215 tests, build, verify:build, `npm audit --omit=dev`
with 0 vulnerabilities, and all six integration suites including real Checklist
Evidence Storage/Chromium coverage. This CI is repository validation only; no linked
project or production execution occurred.

Physical iOS Safari and Android Chrome camera/gallery/file/download acceptance has
not occurred. Quality is not declared 100%; production and physical/mobile gates
remain open.
