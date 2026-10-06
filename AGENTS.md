# Repository Agent Instructions

## Role

You are an implementation agent for Gaúcha Gestão, a sensitive internal corporate platform.

Architecture, product decisions, scope and acceptance criteria are defined outside the coding session and recorded in this repository. Implement approved work; do not redesign the platform opportunistically.

## Sources of truth

For each task:
1. Read the task-specific implementation brief when one exists.
2. Read only the architecture/ADR documents relevant to the affected area.
3. Inspect the relevant current code before editing.
4. Reuse existing conventions and components.

Priority:
1. explicit current task/brief;
2. accepted ADRs;
3. architecture documents;
4. this file;
5. existing implementation conventions.

Stop for clarification only when a conflict or ambiguity prevents safe implementation.

## Architecture invariants

- Modular monolith unless an accepted ADR changes it.
- Core owns stable shared corporate capabilities/entities.
- Business modules may depend on Core and Shared.
- Core must never depend on a business module.
- A module must not reach into another module's internal implementation.
- Cross-module integration uses explicit contracts.
- Do not duplicate shared corporate entities such as users, units or sectors inside modules.

## Engineering rules

- KISS, DRY, YAGNI.
- Prefer small, targeted changes.
- Preserve existing behavior unless the brief changes it.
- Avoid unrelated refactors.
- Reuse before introducing abstractions.
- Keep UI, domain logic, persistence and infrastructure concerns separated.
- Maintain strong typing where supported.
- Handle failures explicitly.
- Add dependencies only for concrete needs.

## Security

- Default deny for authorization.
- UI visibility is not an authorization boundary.
- Enforce access in a trusted server/database layer as applicable.
- Validate untrusted input.
- Never commit secrets, credentials, private keys, production dumps or sensitive environment files.
- Follow least privilege.
- Preserve auditability for sensitive mutations.
- Never weaken auth, authorization or data isolation to simplify implementation.
- Treat uploads as untrusted.
- Do not use production data in development unless explicitly sanitized and approved.

For identity/access/sensitive-data/upload/infrastructure work, consult:
- docs/architecture/SECURITY.md
- docs/architecture/AUTHORIZATION.md

## Database and migrations

- Never edit a migration already applied to a shared environment.
- Use new incremental migrations.
- Preserve existing data unless an approved migration plan says otherwise.
- Destructive changes require explicit approval and recovery planning.
- Do not run production migrations unless explicitly requested.

## Context efficiency

- Do not scan the whole repository by default.
- Start from the brief and affected module.
- Search for relevant symbols/files before opening large files.
- Do not load unrelated module documentation.
- Do not repeatedly read unchanged files without a reason.
- Keep final reports concise.
- Prefer one focused task per session.

## Validation

Before completion:
1. review the final diff;
2. run checks required by the brief;
3. run relevant typecheck/lint/tests/build that exist;
4. fix regressions introduced by the change;
5. validate authorization/data scope when affected;
6. report anything that could not be validated.

Never claim a check passed without running it.

## Git

- Keep commits focused and atomic.
- Use clear commit messages.
- Do not rewrite unrelated history.
- Do not force-push.
- Do not create releases, tags or deploys unless explicitly requested.
- Do not modify production configuration unless explicitly requested.

## Communication

- Execute rather than narrate.
- Do not produce a plan before coding unless asked.
- Ask only when ambiguity blocks safe implementation.
- Otherwise choose the narrowest implementation consistent with the brief and architecture.
- Completion reports should contain only relevant files, migrations, validations, real pending issues and commits.

## Current phase

Core/authorization, Audit Domain v1 (including reopen), Action Plans, Action Plan Evidence, Audit Export & Reporting and Audit Checklist Evidence are implemented. Quality v1 functional software and pre-homologation hardening are integrated. Do not restart those domains.

The institutional UI/Design System is applied to App Shell, Home, Administration and Quality surfaces. Login v3 · Elo is integrated in `main` by PR #17, and Design System Elo v1 (`docs/briefs/DESIGN_SYSTEM_ELO_V1.md`) promotes its language (neutrals, field/button material, green focus, motion) to the whole application. Audit UX v2 (`docs/briefs/AUDIT_UX_V2.md`) reorganizes the Audit experience by monitored unit without changing its domain or contracts. Do not restore or copy the legacy Login rules that were removed from `app/shell.css`; the Login owns its presentation in `core/auth/Login.css`.

Current verified application baseline is PR #18 merge commit `22334995b5b239274c5c1adc98495357ec0d7980`, including the final Quality polish; documentation-only commits may follow it on `main`. Post-merge application CI `37017170877` and reproducible-infrastructure CI `37017171393` passed. The application suite contains 236 tests, including dedicated Login v3 password-reveal regression coverage. The self-hosted stack validation is disposable/reproducible infrastructure evidence only; it is not production deployment evidence.

For Quality closure, read:
- `docs/modules/audit/QUALITY_COMPLETION_V1.md`;
- `docs/modules/audit/QUALITY_ACCEPTANCE_V1.md`;
- the relevant implementation brief.

Physical P1–P9 acceptance and operational O1–O8 readiness remain release gates until actual evidence is recorded. **Production ready: NO.** Repository implementation, browser automation and disposable infrastructure CI do not constitute production readiness.

Do not invent production infrastructure, choose a new framework, migrate another standalone system or create speculative abstractions without an approved brief/ADR.
