# Design Brief — Core Account Lifecycle v1

Status: DESIGN ONLY
Base: `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`
Target integration branch: `integration/core-foundation-v2`

## Objective

Design an operationally self-sufficient account lifecycle for Gaúcha Gestão without exposing privileged Supabase credentials to the browser.

No implementation in this track.

## Current facts to verify

- Supabase Auth is the identity provider.
- Public sign-up is disabled.
- The application currently has login only.
- No app flow exists for administrator-created users, password reset or self-service password change.
- No SMTP configuration is currently present in the repository.
- Core profile activation is separate from Auth session existence.

## Design scope

Define:
- administrator user creation;
- initial/temporary password strategy;
- forced first-login change if appropriate;
- administrator reset strategy;
- self-service authenticated password change;
- forgotten-password path with and without SMTP;
- account deactivation/reactivation and session consequences;
- relationship between Auth account and Core profile creation;
- failure/rollback behavior if Auth creation succeeds but profile creation fails, or vice versa;
- auditing requirements;
- rate limiting/abuse controls;
- secret/service-role boundary;
- whether an Edge Function or another trusted server path is appropriate;
- optional MFA boundary: design whether it belongs in v1, not implementation unless explicitly approved later.

## Security requirements

- service-role/admin Auth credentials never enter browser code;
- administrative account operations require explicit authorization;
- ordinary users cannot create/reset other accounts;
- sensitive operations are auditable without logging secrets/passwords;
- temporary credentials must not be persisted in Core/system logs;
- design should work with the repository's self-hosted Supabase direction.

## Deliverable

Create:
`docs/architecture/ACCOUNT_LIFECYCLE_V1.md`

Include a sequence diagram for:
1. administrator creates user;
2. user first signs in;
3. user changes own password;
4. administrator resets credentials;
5. deactivation/reactivation.

Include explicit decisions still requiring PO approval.

No implementation, migrations or Edge Functions in this branch.
