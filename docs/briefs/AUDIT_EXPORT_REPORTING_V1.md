# Implementation Brief — Audit Export & Reporting v1

Status: implemented in PR #9 (`feat/audit-export-reporting-v1`); independent technical review completed on 2026-09-29; not merged. Physical-device acceptance remains pending.
Date: 2026-09-29  
Development started from `main` at `74f7d2be7e946a8d36f27aac3b6aba22de92cc06` (Quality UI phases 2–3). Before final validation the branch merged `main` at `516b59b505eafe12ecf5dc578a1b529384cde4fb` (adds PR #8, Admin polish); the final checks below ran on that integrated composition.

## Approved outcome

Preserve all three outputs in first Quality scope: **inspection Excel, unit-history Excel, and browser print/save as PDF**. This product decision is closed by the 2026-09-29 task; do not drop history export or replace Excel with CSV. The implementation in PR #9 remains subject to merge and physical-device acceptance.

Read AGENTS.md, AUDIT_DOMAIN_V1.md, AUDIT_SOURCE_OF_TRUTH.md (legacy provenance), the completion matrix, ADR-001/002/004/005 and AUTHORIZATION.md/SECURITY.md. Inspect current Audit API, summaries, scoring and migrations 0004/0009/0010. Export permission was seeded in 0002; the implementation adds `20260929172805_audit_export_reporting_v1.sql`.

## Authorization contract

Every report operation requires **both** `audit.inspection.read` and `audit.inspection.export`, independently effective on the same unit. Read-only users cannot invoke the official export API; export-only users cannot obtain data. A global read grant plus unit export grant exports only that unit; unit read plus global export also exports only the readable unit. Sector-only never covers a unit-wide inspection. Neither role names nor UI button visibility is authority.

Use fresh Core authorization in trusted Audit RPCs, default deny, narrow authenticated EXECUTE, fixed search path/qualified relations. Reject anon/inactive profiles and guessed/foreign inspection/unit IDs without revealing existence. Include tests invoking APIs directly with real JWTs. Read scope must cover joined metadata too: return only the unit label and responsible display name needed for already authorized records, not full Core users, assignments or system logs.

An authorized user can always copy already viewed data or invoke the browser's own print command. `audit.inspection.export` controls the application's report/data endpoint and official buttons; it is not DRM and cannot revoke a downloaded file. Generated files must never contain data fetched with a service credential or supplied by an unchecked client ID list.

## Server data, client rendering

Chosen design: trusted **Audit database RPCs produce coherent, scoped report datasets**; browser creates XLSX and the print view from those datasets. No custom backend, PDF service, stored report object, queue or privileged browser credential.

Why: existing React/Vite + PostgREST stack already supports SQL snapshots and scoped functions. Server authorization and scoring avoid hidden cross-unit joins and inconsistent client aggregation. Client XLSX generation/browser print require no new production runtime and keep sensitive report copies out of application storage. UI-only export of a currently visible page was rejected: it misses paginated/hidden data and cannot independently enforce export permission. A server PDF renderer adds operating cost without a v1 need.

Use a maintained XLSX writer selected and reviewed during implementation (license, lockfile, security and browser memory measured). No library version is invented by this brief. Browser print produces PDF through the platform print dialog; PDF pagination/fonts may vary. No digital signature, certified immutable report or archival PDF guarantee.

Implementation evidence: `write-excel-file@4.1.1` (MIT, browser and Node exports, 2026 release) writes explicit string/number cells. Its `fflate` dependency resolves to patched `0.8.3`; `npm audit --omit=dev` reports zero vulnerabilities on this lockfile. The writer is dynamically imported into a separate ~71.7 kB minified / ~20.0 kB gzip chunk in the Vite build. `read-excel-file@9.3.10` and `fflate@0.8.3` are test-only dependencies. A 5,000-row Node XLSX fixture serializes and is independently reopened by the unit suite (~340 kB; ~0.5–4.3 s observed depending on runner load); real browser memory and mobile save behavior require device verification. No macro, formula, hyperlink or external relationship API is used; ZIP contents are asserted in tests.

## Public data contracts and consistency

Suggested Audit RPCs:

- `inspection_export(p_inspection uuid)` → one versioned report envelope with unit/context, inspection/result, ordered sections and all answers/observations.
- `unit_history_export(p_unit uuid, p_from date default null, p_to date default null)` → one versioned envelope with applied-date filters and **all matching inspection summaries** for that unit, newest by application date then creation time then ID.

Envelope includes report schema version, generated-at UTC, requesting user ID/display name, explicit business-date filters, record count and deterministic ordering. Dates stay dates (no timezone shift); timestamps are ISO instants with explicit display timezone. Use `America/Sao_Paulo` for printed timestamps, retaining UTC in exported metadata.

Capture each envelope with one consistent database statement/snapshot, not separate client calls for summary, answers and names. Draft answers do not bump parent version, so reading inspection.version before/after alone is not a consistency proof. A narrowly scoped stable SQL report query with explicit permission predicates is appropriate; do not mark a function stable if its eventual implementation requires writes or stronger lock semantics. Database authorization evaluates at request snapshot; subsequent requests recheck grants. Revocation cannot recall bytes already delivered.

Do not use `p_overview=true` or the current UI's loaded rows for history; that intentionally limits summaries. Return a single JSON envelope so PostgREST row pagination cannot silently truncate it. Approved generation limit (2026-09-29): at most 5,000 inspection summaries per history export; count first in the same snapshot and fail the entire request with “Narrow the date range” if exceeded. Never silently return the first page or a partial workbook. This bound limits client memory, does not drop history: any date range within the limit can be exported. Performance validation must record maximum-size behavior before release; any future change to the approved bound requires a separate decision reflected in the brief/UI/tests.

While building/printing, hold the dataset only in memory. Clear on logout, loss of session or closing report view. Do not persist reports in localStorage, cache API, service worker, telemetry or URLs. No report content in logs. Network failure/cancel must leave no stale file presented as current. Browser-created files use object URLs revoked after use.

## Content contract

| Output | Required content |
| --- | --- |
| Inspection XLSX — `Resumo` | unit code/name/ID, inspection ID, template version, application/previous visit dates, responsible display name/ID, draft/finalized status, progress, counts AT/AP/NAT/NAP/unanswered, conformity and classification, finalization time/actor if available through authorized projection, inspection version, report generation metadata |
| Inspection XLSX — `Checklist` | all 158 criteria for the pinned template: section order/name, item key/display number/exact text, response including explicit unanswered, full observation, answer version/update time; stable canonical ordering |
| Inspection XLSX — `Secoes` | nine section totals, answered/applicable counts and conformity using existing scoring semantics; distinguish completed section from globally finalized inspection |
| Unit-history XLSX — `Historico` | one row per matching inspection: identifiers, dates/responsible, lifecycle, progress/counts, authoritative final score/classification when finalized; neutral labeled partial value for drafts; delta in percentage points between finalized comparable records, undefined where comparison is impossible |
| Unit-history XLSX — `Metadados` | authorized unit, inclusive applied-date filters, count, ordering, generated-at/by and report schema version |
| Inspection print/PDF | same context, results, all sections/criteria/observations as inspection workbook; no clipping/hidden sections; draft watermark; no navigation/buttons |
| Unit-history print/PDF | same scoped/filter-complete history dataset and metadata, readable repeated table headers |

Print/PDF covers both inspection and history, reusing the corresponding gated datasets. Unit-history is a summary report; detailed criteria/observations are delivered by inspection export, not 158 rows per history entry. No Action Plan fields, attachments' bytes or signed download URLs in either report. Checklist attachment manifests are not a dependency of this slice; any future inclusion requires Audit read-scoped contract review. This allows export implementation independently of evidence work.

Results follow Audit v1 exactly: NAP excluded; AP half-weight; no applicable answers means undefined (display `—`, not zero); draft labeled partial and never given a final classification; final thresholds use unrounded score; display one decimal. Finalized summary uses authoritative persisted result. Section labels must not imply the inspection is finalized. Preserve missing display numbers 32/117/135 and canonical text. Include reopened inspections as draft with no stale final result.

All notes and names are untrusted: XLSX cells must be explicitly strings for user text (including leading `=`, `+`, `-`, `@`, tabs/newlines), with no formulas, external hyperlinks, macros or external workbook relationships. Numeric scores/counts remain numeric cells, identifiers remain text, blank scores stay blank. Escape print text through normal safe rendering, never raw HTML. Safe generated filenames use a fixed report prefix, UUID and timestamp, never raw unit/user names. Test accents, multiline notes, Unicode, long criteria and malicious formula/HTML inputs.

## User flow

Inspection page: “Exportar Excel” and “Imprimir / PDF”; unit history: “Exportar histórico” and “Imprimir / PDF”, with explicit date filters. Show only with read+export for that unit; server always repeats the check. Disable repeat submission while generating. Show preparing/error/retry, zero-history and excessive-range states. No fabricated workbook on failure. Empty history exports a clearly labeled zero-record workbook, not an authorization error.

Print only after the full authorized report is loaded; use a dedicated in-memory print surface with print CSS, repeated headers and sensible page breaks. Wait for layout readiness; print all sections, including those hidden in the checklist editor. Do not print stale unsaved client edits: reports reflect persisted database state at generated-at. Announce this and prevent confusion while local saves are pending.

Mobile at 375px: operable actions, long names wrap, no popup-dependent async download, keyboard/focus and accessible generation status. Manual iOS Safari/Android Chrome verify actual XLSX saving/opening and print/share-to-PDF behavior; report browser limitations explicitly, do not claim an automatic PDF download.

## Tests and release evidence

1. SQL and real Auth/JWT/PostgREST: no session, inactive, no grants, read-only, export-only, global/unit intersection, sector-only, wrong/guessed IDs, inactive-unit historical read, permission revocation between requests, caller-supplied filters unable to cross units.
2. Content fixtures: new draft, partial, all AT, mixed AP/NAT, all NAP, boundary scores, finalized/reopened, exact 158/9 catalog, full observations and stable order. Independent expected values, not snapshots of the same renderer.
3. History: more than API page limit, inclusive dates, identical dates/tie ordering, all statuses, no overview truncation, null deltas, zero rows, exactly limit and limit+1; assert complete result or explicit failure.
4. Concurrency: answer changes/finalize/reopen during export cannot mix separate database states in one envelope; document snapshot boundary and test with real PostgreSQL sessions.
5. Parse generated XLSX with an independent reader: workbook sheets, values/types, accents/newlines, no formulas/external links, count and scope. Print/PDF automated rendering: all criteria and observations present, no app chrome, readable long text/page breaks at desktop and 375px; manually validate physical/PDF output.
6. XSS/formula injection, no sensitive payload/URLs in logs/storage, session change discards prepared data. No Action Plan/internal Core fields leak.
7. Existing typecheck/lint/tests/build/verify:build and local integration suites remain green; record new suite commands, browser/device checks and performance at the supported bound. No production changes.

Implementation sequence: incremental scoped report RPCs and data tests; typed Audit export boundary; XLSX serializer and print UI; permission/content/mobile tests and completion matrix update. Never edit old migrations or introduce an ungated export route. No scheduled reporting, email, cross-unit executive dashboard, import/portable archive, report storage or infrastructure/deploy work.

## Implementation and verification in this branch

- `inspection_export` and `unit_history_export` are `STABLE SECURITY DEFINER` Audit RPCs with qualified relations, `search_path=''`, authenticated-only EXECUTE and independent read/export predicates against the same unit. Each envelope is assembled in one SELECT and therefore one statement snapshot. Count >5,000 raises `Narrow the date range`; 5,000 and zero produce complete envelopes.
- `apps/web/src/modules/audit/reporting/` holds typed RPC access, XLSX sheets, safe filenames, object-URL cleanup, an in-memory print portal and action states. Inspection and history pages gate buttons in the UI. Inspection reports stay blocked while any answer has a save in flight, a failed save, or observation text that differs from the last saved value (including text typed while an earlier save was in flight); starting a change invalidates a report being prepared, and a stale inspection blocks until reload. Report data is dropped on closing the portal, losing authorization/session, changing filters or unmounting.
- On the integrated composition (after merging `main` `516b59b`), local `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (16 files, 165 tests), `npm run build` with CI public placeholders, `npm run verify:build` and `npm audit --omit=dev` (0 vulnerabilities) passed.
- Maximum-size history: `tests/audit-reporting-database.test.ts` proves the functional bound in CI (exactly 5,000 complete and ordered; 5,001 raises `Narrow the date range`; no truncation). Its extra inspections have no answer rows, so its timing is not a performance measure. The representative benchmark is `tests/performance/reporting-history.mjs` (outside `npm test`): exactly 5,000 inspections of one unit, each with all 158 `inspection_answers` materialized by bulk SQL (790,000 rows; ~90% finalized with persisted results, drafts with unanswered items, AP/NAT observations). Run on 2026-09-29 on a Windows 11 workstation: disposable Docker `postgres:18.4` on `127.0.0.1` (JIT on, the PostgreSQL and Supabase image default) — 3.8–4.8 s per call over 10 calls, JSON ~3.1 MB (2.96 MiB); the same data in PGlite — 1.7–2.2 s. About 1.4–1.8 s of the PostgreSQL time is JIT compilation (with `jit=off` the same call took ~2.6 s); the rest is the per-inspection indexed answer count. 5,001 was rejected with `Narrow the date range` in ~0.1 s (PostgreSQL) / 0.04–1.1 s (PGlite), before any summary is built. Fixture generation takes ~1.5–2 min, which is why it is not in the default suite. These are workstation observations, not a production latency guarantee or SLA.
- `tests/integration/reporting.mjs` uses disposable local Supabase Auth/JWT/PostgREST and a PostgreSQL snapshot; the existing Audit browser integration checks XLSX downloads and the dedicated 375px print portal. The workflow runs both after Action Plans and Evidence. The review workstation's local Supabase stack holds unrelated development data, so these suites were not run against it; they run on the disposable GitHub Actions runner for PR #9. Physical iOS/Android and browser print/save acceptance remain to be recorded.

## Approved decisions and boundaries

The product owner explicitly approved the specified content, inspection Excel, unit-history Excel, browser print/save-as-PDF and the limit of 5,000 summaries per generation on 2026-09-29. No report-content/format/limit approval remains pending. Server-side PDF, digital signatures and report storage are excluded from v1. Any future signed/historical immutable report requires a separate product decision. Operational retention/RPO/RTO do not become application export requirements by implication. No human approval to deploy is inferred from approval of this brief.
