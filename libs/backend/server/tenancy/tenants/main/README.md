# @opencrane/backend/server/tenancy/tenants — tenant workspace lifecycle

> [backend](../../../../README.md) › [server](../../../README.md) › [tenancy](../../README.md) › tenants

## What it owns

This package is part of **Tenancy** — the domain that connects fleet state to a single silo (one tenant's isolated running environment), and it
is the centre of that domain: the lifecycle of a **tenant**, one customer's isolated workspace. It
owns creating, reading, updating, suspending, and deleting a tenant, the dataset memberships that
say which slices of org memory that tenant may see, and the inputs the effective contract compiles
from.

The authoritative record of a tenant is a Kubernetes custom resource (`Tenant` CRD); the silo API
serves a Postgres **projection** (mirror) of it. This package writes both — it dual-writes the CRD
and the projection row on create — and drives the whole lifecycle:

```
 operator / API  POST /api/v1/tenants
        │
        ▼
 ┌───────────────────────────────────────────────┐
 │  tenants   ◄── HERE                             │
 │  1. create Tenant CRD  → wait for it to appear  │
 │  2. write projection row + derived datasets     │
 │  3. suspend/resume (flag)  ·  delete (teardown)  │
 └───────────────────────────────────────────────┘
        │ cut pod        │ repair drift      │ revoke LLM key
        ▼                ▼                   ▼
 [connections]      [projection]         [spend]        → [contract] compiles from this
```

**In this flow:** [connections](../../connections/main/README.md) · [projection](../../projection/main/README.md) · [spend](../../../reporting/spend/main/README.md) · [contract](../../contract/main/README.md) · [grants](../../../iam/grants/main/README.md) *(permission records)*

Invariant: the CRD is the source of truth; the projection is repaired to match it, never the
reverse. Suspension is a `spec.suspended` merge-patch that leaves the rest of the spec untouched
(the operator scales the Deployment to zero and back) — it keeps the workspace, it does not tear it
down. Teardown is the one destructive path and fans out to its neighbours: cut the pod, revoke the
LiteLLM (the model-router) key, delete the CRD. Dataset membership is *derived* from grants, so the retrieval scope a
tenant sees always follows its actual entitlements.

## Public surface

- `tenantsRouter` (mounted at `/api/v1/tenants`) — tenant CRUD over the Tenant CRD + projection, suspend/resume, dataset membership, and the drift/repair endpoints.
- `_SetTenantSuspended` — the shared `spec.suspended` merge-patch, also driven by the membership projection repairer.
- `_SyncDerivedDatasetMembership` — recompute a tenant's dataset membership from its grants (reused by the contract endpoint).
- The tenant request/response types (create, effective contract, dataset membership) and the OpenAPI fragment.

## Boundary

Consumed by the opencrane-server HTTP layer, and it orchestrates its tenancy/reporting neighbours on
teardown and repair. It owns tenant state and lifecycle; it does not route connections, render the
contract, or compute grants itself — each of those is its own domain.

## Dependency direction

Tagged `scope:tenants`: it may depend only on `scope:connections`, `scope:grants`, `scope:k8s-api`,
`scope:projection`, `scope:retrieval`, `scope:spend`, `scope:tenants`, and `scope:shared` — never on
apps.

## Data & persistence

Owns the `Tenant` model in `apps/opencrane/prisma/schema/tenants.prisma`. The projection row is the
DB mirror of the authoritative `Tenant` CRD.

## See also

- Parent index: [tenancy](../../README.md)
- Siblings: [cluster-tenants](../../cluster-tenants/main/README.md) · [connections](../../connections/main/README.md) · [contract](../../contract/main/README.md) · [projection](../../projection/main/README.md)
