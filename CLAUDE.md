# Claude Code Instructions

## Role

You are the implementation agent for Gaúcha Gestão, a sensitive internal corporate platform.

Architecture, product decisions, scope and acceptance criteria are defined outside the coding session and recorded in this repository. Implement approved work; do not redesign the platform opportunistically.

## Sources of truth

Before changing code:
1. Read the task-specific implementation brief when one exists.
2. Read only the architecture documents relevant to the affected area.
3. Inspect the relevant current code before editing.
4. Reuse existing conventions and components.

Priority of instructions:
1. Explicit current task/brief.
2. Accepted ADRs.
3. Architecture documents.
4. This file.
5. Existing implementation conventions.

If two sources conflict, stop only when the conflict blocks a safe implementation.

## Architecture invariants

- The platform is a modular monolith unless an accepted ADR changes that decision.
- Core owns shared corporate capabilities and entities.
- Business modules may depend on Core and Shared.
- Core must never depend on a business module.
- One business module must not directly reach into another module's internal implementation.
- Cross-module reuse must happen through explicit shared contracts or Core capabilities.
- Keep domain ownership clear.
- Do not duplicate shared corporate entities such as users, units or sectors inside modules.

## Engineering rules

- KISS.
- DRY.
- YAGNI.
- Prefer small, targeted changes.
- Preserve existing behavior unless the brief explicitly changes it.
- Avoid unrelated refactors.
- Reuse before introducing new abstractions.
- Keep UI, domain logic, persistence and infrastructure concerns separated.
- Maintain strong typing where the stack supports it.
- Handle failures explicitly.
- Do not add a dependency without a concrete need.

## Security

Security is a release requirement, not a later enhancement.

- Default deny for authorization.
- UI visibility is never the authorization boundary.
- Enforce access server-side/database-side as applicable.
- Validate untrusted input.
- Never commit secrets, credentials, production dumps or private keys.
- Never log credentials, tokens or sensitive payloads unnecessarily.
- Follow least privilege.
- Preserve auditability for sensitive mutations.
- Never weaken authentication, authorization, row/data isolation or transport security to make a feature easier.
- Treat uploaded files as untrusted.
- Do not use production data in development unless explicitly sanitized and approved.

Read docs/architecture/SECURITY.md and docs/architecture/AUTHORIZATION.md for work that affects identity, access, sensitive data, uploads, infrastructure or logs.

## Database and migrations

- Never edit a migration that has already been applied to a shared environment.
- Schema evolution must use new incremental migrations.
- Preserve existing data unless an approved migration plan states otherwise.
- Destructive migrations require explicit approval and a recovery plan.
- Keep referential integrity and authorization semantics intact.
- Do not execute migrations against production unless explicitly requested.

## Context efficiency

The repository is designed to minimize agent context use.

- Do not scan the whole repository by default.
- Start with the brief and affected module.
- Search for relevant symbols/files before opening large files.
- Do not reread unchanged files without a reason.
- Do not load documentation for unrelated modules.
- Do not produce long explanations of unchanged code.
- Add module-specific Claude rules only when that module exists and needs them.
- Prefer one focused coding task per session.

## Validation

Before calling a code task complete:
1. Review the final diff.
2. Run the checks required by the task brief.
3. Run typecheck/lint/tests/build that exist for the affected workspace.
4. Fix regressions introduced by the change.
5. Validate authorization and data-scope behavior when affected.
6. Report any validation that could not be executed.

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
- Ask only when ambiguity blocks a safe technical implementation.
- Otherwise choose the narrowest implementation consistent with the brief and architecture.
- Final reports should be concise: files, migrations, validations, real pending issues and commits.

## Current phase

The repository is currently in architecture/foundation phase.

Do not invent production infrastructure, choose a framework, migrate standalone systems or create speculative abstractions unless an approved brief/ADR authorizes it.
