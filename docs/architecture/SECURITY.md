# Security Baseline

## Principle

Gaúcha Gestão will contain operational, financial, contractual and quality data. Security controls are part of the architecture and acceptance criteria.

The default posture is least privilege and default deny.

## Security layers

Access should be enforced in multiple layers where applicable:

~~~
User
-> Authentication
-> Session
-> Permission
-> Organizational scope
-> Domain authorization
-> Database/storage boundary
-> Audit log
~~~

Hiding a menu item or button is not authorization.

## Identity

- One person should have one identifiable account.
- Shared accounts should be avoided.
- Account lifecycle must support activation and deactivation.
- Privileged access must be distinguishable from ordinary access.
- Supabase Auth is selected by ADR-004/ADR-005 and integrated with active Core profiles.
- Password/token/session storage must use established platform mechanisms, never custom cryptography.

## Authorization

Authorization must consider both capability and scope.

Example:

~~~
fleet.expense.write
+
unit in user's allowed scope
~~~

See AUTHORIZATION.md.

## Secrets

Secrets must never be committed to Git.

Examples:
- database passwords;
- signing secrets;
- API secret keys;
- SMTP credentials;
- object-storage credentials;
- production environment files;
- private certificates/keys.

Secrets must be injected by the runtime/environment or an approved secret-management mechanism.

## Sensitive data

Before each module migration, classify the data it stores.

At minimum evaluate:
- financial sensitivity;
- contractual/confidential information;
- personal data;
- credentials/tokens;
- uploaded documents;
- operational data that should be department-restricted.

Collect only data that has a business purpose.

## Uploads

Uploaded content is untrusted.

Evidence/Storage v1 defines these controls for Action Plans; Audit Checklist Evidence is governed by its [implementation contract](../modules/audit/CHECKLIST_EVIDENCE_V1.md) and approved brief. Each owning module must define:
- allowed file types;
- maximum size;
- object naming;
- authorization before download;
- authorization before deletion;
- metadata ownership;
- malware/unsafe-file handling as appropriate;
- backup behavior.

Database rows should normally store file metadata/references rather than arbitrary large binary payloads.

## System audit trail

Sensitive mutations should produce an immutable or tamper-resistant application audit trail sufficient to answer:

- who performed the action;
- when;
- which entity was affected;
- action type;
- relevant before/after information where justified;
- request/correlation context where available.

Do not store secrets in audit payloads.

Application audit logs are separate from Quality Audit business records.

## Infrastructure baseline

Production must not be approved solely because the application starts successfully.

Before production:
- supported operating system/runtime;
- security updates;
- firewall/network exposure reviewed;
- TLS where traffic leaves a trusted termination boundary;
- least-privilege service accounts;
- database not unnecessarily exposed;
- backups configured;
- restore procedure tested;
- production secrets separated from development;
- logging available for operational/security investigation.

Legacy unsupported operating systems must not be accepted as the default production design without a documented risk decision and compensating controls.

## Dependency and supply-chain hygiene

- minimize dependencies;
- pin/lock dependency versions using the ecosystem's standard lockfile;
- review high-risk dependencies;
- address known critical vulnerabilities;
- CI should run deterministic validation.

## Error handling

User-visible errors must not reveal:
- stack traces;
- secrets;
- internal database details;
- filesystem paths that create unnecessary exposure.

Operational logs may contain technical detail but must still exclude secrets.

## Production changes

Agents and developers must not:
- deploy implicitly;
- run production migrations implicitly;
- modify production secrets implicitly;
- delete production data without explicit authorization and recovery planning.

## Incident readiness

Before broad rollout, document:
- who can disable accounts;
- how access is revoked;
- how logs are inspected;
- how a compromised credential is rotated;
- how a bad deployment is rolled back;
- how data is restored from backup.

