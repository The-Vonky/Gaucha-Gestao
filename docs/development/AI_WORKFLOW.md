# AI-Assisted Development Workflow

## Goal

Use AI for high implementation throughput without paying repeatedly for unnecessary repository context.

## Shared agent contract

`AGENTS.md` is the tool-neutral repository instruction file.

Coding environments that support `AGENTS.md` should use it directly. Tool-specific instruction files may add only small tool-specific guidance and must not duplicate the full rule set.

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
AGENTS.md
+ task-specific brief
+ only the relevant ADR/architecture docs
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

## Astra -> Claude -> Astra handoff

The repository, not the model conversation, is the source of execution state.

For substantial work:
1. use a dedicated feature/fix branch when practical;
2. keep the implementation brief committed in the repository;
3. make focused atomic commits at meaningful stable checkpoints;
4. keep uncommitted work small and intentional;
5. before switching agents, ensure the current branch, `git status`, diff and recent commits explain the state.

The next agent should begin by reading:
- `AGENTS.md`;
- the current task brief;
- only relevant architecture/module docs;
- `git status`;
- current diff;
- recent focused commits.

Do not paste the entire previous AI conversation into the next model.

A typical continuation instruction is:

~~~
Continue the current task from this repository state.

Read AGENTS.md and <brief path>.
Inspect git status, current diff and the recent commits on this branch.
Do not redo completed work.
Continue the remaining scope, validate it and keep commits atomic.
~~~

This makes switching models inexpensive because completed reasoning is represented by code, Git history and the brief instead of chat tokens.

## Context controls

- module-specific docs stay separate;
- architecture docs stay topic-specific;
- path-scoped agent rules should be added only once a module exists and genuinely needs them;
- avoid giant evergreen instruction files;
- search first, read second;
- clear sessions when moving to an unrelated task;
- compact only when continuing the same long task.

## Model usage

Use the strongest available coding model while its quota is economically sensible, then continue with another capable agent from the same Git state.

Do not ask the replacement agent to re-plan completed work.

Reserve high-cost reasoning for genuinely difficult debugging, migrations or architectural edge cases.

Avoid multiple parallel agents unless the benefit clearly exceeds the extra token usage and merge complexity.

## Repository organization

The final source tree should make it possible for an agent working on Fleet, for example, to focus mainly on:

~~~
Core contracts actually used
Shared primitives actually used
Fleet module
Current brief
~~~

It should not need Contracts, ABC, Audit and ISO internals to change a Fleet screen.

## Completion report

For code tasks, prefer:
- main files changed;
- migration created;
- validations/tests executed;
- real pending issues;
- commits.

Long narrative summaries usually add little value after the brief and Git history already exist.
