# @opencrane/backend/server/tenancy/projection — CRD read-model drift repair

> [backend](../../../../README.md) › [server](../../../README.md) › [tenancy](../../README.md) › projection

## What it owns

This package is part of **Tenancy** — the domain that connects fleet state to a single silo. The
authoritative record of a workspace is a Kubernetes custom resource (`CR`) — a `Tenant` CRD, an
`AccessPolicy` CRD — but the silo's own API reads a **projection**: a mirror of those CRDs kept as
Postgres rows so queries are fast and do not hit the cluster. **Drift** is when the two disagree
(a CR the fleet created out-of-band has no projection row yet). This package owns detecting that
drift and repairing it.

It runs two fail-soft background loops for the silo — one reconciling `Tenant` CRDs into the DB,
one reconciling the fleet's membership into the silo's `OrgMembership` read-model — and exposes the
detect/repair primitives its neighbours reuse:

```
 authoritative CRDs (Tenant · AccessPolicy) + fleet membership
        │
        ▼  periodic sweep (fail-soft; interval 0 disables)
 ┌───────────────────────────────────────────────┐
 │  projection   ◄── HERE                          │
 │  · detect drift (CRD ↔ DB)                      │
 │  · repair: create/refresh missing DB rows       │
 └───────────────────────────────────────────────┘
        │ converged read-model         │ drift report
        ▼                              ▼
 [tenants] API reads real state    [metrics] exposes drift count
```

**In this flow:** [cluster-tenants](../../cluster-tenants/main/README.md) · [tenants](../../tenants/main/README.md) · [metrics](../../../reporting/metrics/main/README.md)

Invariant: the CRD is the source of truth and the DB is repaired to match it — never the reverse.
Every sweep is **idempotent** (a converged namespace is a no-op) and **fail-soft** (a sweep error
is logged and the loop continues). The membership repairer only starts once this silo's org
resolves (via `cluster-tenants`); until then it idles rather than guessing.

## Public surface

- `_DetectTenantProjectionDrift`, `_DetectPolicyProjectionDrift` — detect-only CRD↔DB comparison, reused by `tenants` and `metrics`.
- `_RepairTenantProjection` — reconcile `Tenant` projection rows from the CRD source of truth (dry-run by default).
- `TenantProjectionRepairer`, `MembershipProjectionRepairer`, `ProjectionLifecycle` — the background repair loops and the lifecycle that owns them.
- The projection drift/repair and lifecycle types, plus the OpenAPI fragment.

## Boundary

Consumed by `tenants` (drift/repair endpoints), `metrics` (drift summary), and boot (the lifecycle
loops). It repairs read-models; it does not create or delete the authoritative CRDs, and it makes
no allow/deny decision.

## Dependency direction

Tagged `scope:projection`: it may depend only on `scope:cluster-tenants`, `scope:k8s-api`,
`scope:projection`, and `scope:shared` — never on apps or unlisted sibling domains.

## Data & persistence

Owns no Prisma model of its own. It repairs the `Tenant` and `OrgMembership` read-models (owned by
`tenants` and `cluster-tenants`) against their authoritative CRDs.

## See also

- Parent index: [tenancy](../../README.md)
- Siblings: [cluster-tenants](../../cluster-tenants/main/README.md) · [connections](../../connections/main/README.md) · [contract](../../contract/main/README.md) · [tenants](../../tenants/main/README.md)
