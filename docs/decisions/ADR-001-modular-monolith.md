# ADR-001 — Modular Monolith

Status: Accepted  
Date: 2026-09-24

## Context

Gaúcha Gestão will consolidate nine internal systems. The platform is expected to be maintained by a small development capacity and several domains share corporate concepts such as users and units.

Independent microservices would add deployment, networking, observability, consistency and operational overhead before that complexity is justified.

A single unstructured monolith, however, would make nine domains increasingly difficult to maintain and expensive for both humans and coding agents to understand.

## Decision

Use a modular monolith.

The application is deployed/operated as one platform architecture, while business domains remain explicit modules with controlled dependencies.

Core provides stable shared corporate capabilities.

Modules can depend on Core/Shared but cannot reach into other modules' internal implementation.

## Consequences

Positive:
- simpler deployment and operations;
- easier transactions and shared infrastructure;
- fewer distributed-system failure modes;
- faster development;
- reduced context required to work within one domain;
- future extraction remains possible if a domain truly needs independent scaling/team ownership.

Trade-offs:
- boundaries rely on engineering discipline;
- careless imports/database access can create hidden coupling;
- a platform-level outage can affect multiple modules.

## Revisit when

Reconsider service extraction only when there is evidence such as:
- materially different scaling requirements;
- independent deployment cadence with real organizational ownership;
- isolation/compliance requirement;
- clear operational benefit greater than distributed-system cost.
