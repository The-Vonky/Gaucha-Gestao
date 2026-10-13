# Design Brief — Core Consumer Contract Map v1

Status: DESIGN ONLY
Base: `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`
Target integration branch: `integration/core-foundation-v2`

## Objective

Identify which stable Core primitives the remaining business modules require before Core Foundation v2 is frozen.

Do not implement any business module.

## Modules in scope

Use the accepted product structure/roadmap:
- ISO Records / legacy Propostas ISO;
- Sales / Card Machines;
- Satisfaction Survey;
- Meeting Room Scheduling;
- Fleet;
- Planned vs Actual;
- ABC Curve;
- Contracts ERP.

Audit and Action Plans are existing consumers and should be used as evidence, not reimplemented.

## Method

For each module, derive only requirements supported by repository docs or available source-system evidence.

Map needs such as:
- authenticated user;
- responsible/owner/participant;
- unit;
- sector;
- role/permission scope;
- historical actor;
- attachments;
- date/money primitives;
- cross-module references.

If a requirement is unknown, mark UNKNOWN. Do not guess a relationship merely because it seems likely.

## Deliverable

Create:
`docs/architecture/CORE_CONSUMER_CONTRACT_MAP_V1.md`

Include:
- matrix: module x Core primitive;
- evidence/reference for each non-obvious dependency;
- candidate Core contracts that are genuinely shared;
- items that must remain module-owned;
- contradictions/gaps requiring product clarification;
- minimum Core closure criteria before the next module starts.

No code, migration or future-module permission seeding.
