# Brief — Readable Logs UI v1

Read AGENTS.md, docs/briefs/CORE_ADMIN_UI_WAVE3.md, docs/briefs/CORE_AUDIT_LOG_READ_MODEL_V1.md, current LogsPage and existing api/types.

Implement a human-readable read-only LogsPage backed by core.audit_log_page via its own audit-log-review-api.ts and page-scoped types:
- filter by date range, actor UUID or authorized actor-name search, module/action, entity type/id;
- date semantics [from,to); stable paginated sorting and total count; explicit reset filters;
- show who/when/action/entity/unit/sector in operator language, IDs and before/after/metadata in a secondary technical detail view;
- read-model's actor name search only finds visible actors; communicate this when filtered;
- preserve unknown/unreadable name as unavailable rather than inventing name;
- safe labels of active/inactive entity, privacy and authorized scope;
- appropriate loading/error/empty/denied states and responsive accessible PT-BR UI;
- preserve existing log page navigation and permission gate. No new permissions.
Own only LogsPage.tsx, new audit-log-review* files/tests. DO NOT change shared api.ts/types.ts/admin.css/parts.tsx or tests/admin*.
No migrations, no log mutations or retention changes. Test filters, time boundaries, inaccessible names, malformed input, details, pagination and RPC error states.
Push normal and PR to integration/core-foundation-v2-wave2; no merge.