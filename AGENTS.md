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

Core/authorization, Audit Domain v1 (including reopen), Action Plans and Action Plan Evidence are implemented. Quality UI foundation is integrated; remaining module UX work is tracked separately.

For the remaining first Quality scope, read `docs/modules/audit/QUALITY_COMPLETION_V1.md` and the relevant implementation brief. Checklist evidence and Audit export/reporting are not yet implemented. Repository implementation and CI do not constitute production readiness.

Do not invent production infrastructure, choose a framework, migrate standalone systems or create speculative abstractions without an approved brief/ADR.

