# AI-Assisted Development Workflow

## Goal

Use AI for high implementation throughput without paying repeatedly for unnecessary repository context.

## Responsibilities

Planning/architecture stage:
- requirements;
- domain decisions;
- architectural decisions;
- security constraints;
- UX direction;
- implementation brief;
- acceptance criteria.

Coding agent stage:
- inspect affected code;
- implement approved brief;
- run validation;
- correct regressions;
- produce focused commits.

The coding agent should not be asked to rediscover product architecture for every task.

## Unit of work

Prefer one focused feature/fix per coding session.

Input should normally be:

~~~
CLAUDE.md
+ task-specific brief
+ relevant accepted ADR/architecture doc
+ affected module/code
~~~

Avoid:

~~~
Read the entire repository and improve everything.
~~~

## Brief format

A useful implementation brief should contain:
- objective;
- current behavior/context;
- in-scope requirements;
- explicitly out-of-scope items;
- affected domain/module;
- data/schema impact;
- security/access impact;
- UX requirements;
- compatibility constraints;
- validation/acceptance criteria.

Do not repeat all platform documentation inside every brief.

## Context controls

- module-specific docs stay separate;
- architecture docs stay topic-specific;
- module-specific Claude rules should be path-scoped once code exists;
- avoid giant evergreen instruction files;
- search first, read second;
- clear coding sessions when moving to an unrelated task;
- compact only when continuing the same long task.

## Model usage

Use the least expensive capable model for routine implementation and reserve the strongest reasoning model for genuinely difficult debugging, migrations or architectural edge cases.

Avoid multiple parallel agents unless isolation/parallelism has a concrete benefit worth the additional token usage.

## Repository organization

The final source tree should make it possible for an agent working on Fleet, for example, to focus mainly on:

~~~
Core contracts actually used
Shared primitives actually used
Fleet module
Current brief
~~~

It should not need to load Contracts, ABC, Audit and ISO internals to change a Fleet screen.

## Completion report

For code tasks, prefer a compact report:
- main files changed;
- migration created;
- validations/tests executed;
- real pending issues;
- commits.

Long narrative summaries consume context and usually add little value after the brief and Git diff already exist.
