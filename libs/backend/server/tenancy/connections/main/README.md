# @opencrane/backend/server/tenancy/connections — gateway routing & kill switch

> [backend](../../../../README.md) › [server](../../../README.md) › [tenancy](../../README.md) › connections

## What it owns

This package is part of **Tenancy** — the domain that connects fleet state to a single silo. It
owns the runtime **connect path**: given a person who has authenticated, work out the one tenant
pod they may reach, refuse the connection if their org membership has been suspended, and provide
the kill switch that force-disconnects a tenant. A **tenant** is one customer's isolated workspace;
its live agent runs in a single-user **pod** (a running container) named `openclaw-<tenant>`.

It is the routing-level half of cross-tenant safety, invoked when a session upgrades to the gateway
and when an operator needs to cut a workspace off:

```
 session connects (email verified by the identity provider)
        │
        ▼
 ┌───────────────────────────────────────────────┐
 │  connections   ◄── HERE                         │
 │  · email → the one tenant pod (fail closed)     │
 │  · suspended org membership? → refuse           │
 │  · kill switch: force-delete the tenant's pod   │
 └───────────────────────────────────────────────┘
        │ forward target (pod service + namespace)
        ▼
 gateway proxy  →  the tenant's OpenClaw pod
```

Invariant: routing is derived **solely** from the verified email — there is no request-supplied
tenant input. The lookup fails closed: zero matches or an ambiguous (more than one) match returns a
refusal reason, never an arbitrary pick, so a caller can never be routed to someone else's pod.
Suspension is an explicit `Suspended` membership row — an *absent* row means not suspended (legacy
and standalone tenants keep working). The namespace for a pod is re-derived deterministically as
`opencrane-<org>` so routing needs no live cluster read.

## Public surface

- `_ResolveGatewayTarget` — email → `{ user, tenant, podService }` forward target, or a fail-closed reason (`NO_EMAIL` / `NO_TENANT` / `AMBIGUOUS_TENANT` / `MEMBER_SUSPENDED`).
- `_IsMemberSuspended` — whether a subject holds a suspended `OrgMembership` in an org.
- `_CutTenant` — the kill switch; force-deletes every pod labelled for the tenant.
- `_NamespaceForOrg` — the `opencrane-<org>` namespace-naming contract, kept in lockstep with the operator.
- `authConnectionsRouter` — the connection-auth router consumed by the auth/gateway layer.

## Boundary

Consumed by the auth / gateway layer (routing, suspension) and by the tenants domain (which calls
`_CutTenant` on teardown). It decides routing and cut-off only; the pod-level owner pinning that
completes cross-tenant safety lives in the runtime, not here.

## Dependency direction

Tagged `scope:connections`: it may depend only on `scope:auth`, `scope:connections`, and
`scope:shared` — never on apps or sibling domains.

## Data & persistence

Owns no Prisma model (the legacy connection registry was deleted). It reads the silo's `Tenant` and
`OrgMembership` read-models, which are owned by the `tenants` and `cluster-tenants` domains.

## See also

- Parent index: [tenancy](../../README.md)
- Siblings: [cluster-tenants](../../cluster-tenants/main/README.md) · [contract](../../contract/main/README.md) · [projection](../../projection/main/README.md) · [tenants](../../tenants/main/README.md)
