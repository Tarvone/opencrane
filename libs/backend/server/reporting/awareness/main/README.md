# @opencrane/backend/server/reporting/awareness — org-memory rollout & fleet participation

> [backend](../../../../README.md) › [server](../../../README.md) › [reporting](../../README.md) › awareness

## What it owns

This package is part of **Reporting** — the observability side of OpenCrane. It owns the staged
rollout of the **awareness contract** (the versioned instruction set that tells each tenant's agent
how to draw on org memory) and the monitoring of whether the fleet is actually running it. The
**fleet** is every tenant workspace across the cluster; a **wave** is a slice of that fleet
promoted together.

It plays two roles. First, it is the authority for a **canary rollout** — a new awareness version
is promoted one wave at a time, narrow to wide (`personal → project → department → org`), so the
blast radius widens gradually and a bad version can be rolled back in one step. Second, it is the
**participation monitor**: each tenant pod reports heartbeats, skill executions, and its running
version, and this package rolls those up into a fleet health report.

```
 rollout control (promote / rollback)        tenant pods report in
        │  next wave promoted                        │  participation event (at-least-once)
        ▼                                            ▼
 ┌───────────────────────────────────────────────────────────────┐
 │  awareness   ◄── HERE                                           │
 │  · resolve expected version per tenant wave                     │
 │  · dedup events, roll up liveness / drift / violations          │
 └───────────────────────────────────────────────────────────────┘
        │  expected version                     │  fleet participation report
        ▼                                        ▼
 [contract] serves it to the pod          [metrics] exposes it for scraping
```

**In this flow:** [contract](../../../tenancy/contract/main/README.md) · [metrics](../../metrics/main/README.md)

Invariant: participation events are recorded exactly once even under at-least-once redelivery (a
duplicate `(tenant, idempotencyKey)` is a no-op, so counters never double-count), and an
unassigned tenant is treated as the *last* wave so it is promoted only when the rollout is fully
complete. Severity is fixed by the locked model: a policy-violating execution is **critical**
(page), while non-participation or version **drift** is a **warning**.

## Public surface

- `_ResolveAwarenessVersion`, `_PromoteNextWave`, `_PromoteToWave`, `_Rollback`, `_NextWave`, `_NormalizeRollout` — the canary rollout state machine; `_LoadAwarenessRollout` loads the singleton.
- `_RecordParticipationEvent`, `_ClassifyParticipation`, `_BuildFleetParticipationReport` — event ingest, per-tenant severity, and the fleet rollup.
- `_RenderAwarenessMetrics` and the awareness routers (`/api/v1/awareness/*`, `/api/internal/awareness/participation`), plus the rollout/participation types and defaults.

## Boundary

Consumed by contract (which reads the expected version for a tenant's wave) and metrics (which
renders the report for Prometheus). It reports and resolves state only; it does not itself serve
the contract to pods or scrape metrics.

## Dependency direction

Tagged `scope:awareness`: it may depend only on `scope:awareness` and `scope:shared` — never on
apps or sibling domains.

## Data & persistence

Owns `AwarenessRollout`, `ParticipationEvent`, `TenantParticipation`, `OrgDocument`, and
`HarvestingCursor` (with the `ParticipationEventKind` enum) in
`apps/opencrane/prisma/schema/awareness.prisma`.

## See also

- Parent index: [reporting](../../README.md)
- Siblings: [metrics](../../metrics/main/README.md) · [spend](../../spend/main/README.md)
