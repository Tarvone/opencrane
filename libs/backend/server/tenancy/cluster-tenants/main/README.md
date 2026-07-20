# @opencrane/backend/server/tenancy/cluster-tenants — org identity, seeding & scope guard

> [backend](../../../../README.md) › [server](../../../README.md) › [tenancy](../../README.md) › cluster-tenants

## What it owns

This package is part of **Tenancy** — the domain that connects fleet state to a single silo. A
few terms first: a **ClusterTenant** is a first-class customer/organisation entity that sits
*above* individual tenants (one company, which may hold many tenant workspaces); a **silo** is that
customer's own slice of the cluster, which in practice is one Kubernetes namespace. This package
owns the answer to "**which org does this silo serve?**", the boot-time seeding that stands a
standalone org up, the provisioning of an org's public domain, and the guard that stops a caller
from mutating another org's resources.

The ClusterTenant itself is a cluster-scoped Kubernetes custom resource (`CR`) — not a database
row — normally created by the fleet-manager. This package resolves it, and in a truly standalone
install seeds it, then keeps a local read-model of who belongs to the org:

```
 silo boots (its own namespace)
        │
        ▼
 ┌───────────────────────────────────────────────┐
 │  cluster-tenants   ◄── HERE                     │
 │  · seed own ClusterTenant CR + default tenant   │
 │  · resolve WHICH org this silo serves           │
 │  · scope guard: does the caller own this silo?  │
 └───────────────────────────────────────────────┘
        │ resolved org name          │ provision org domain (cert + DNS)
        ▼                            ▼
 [projection] membership loop    cert-manager · DNSEndpoint
```

**In this flow:** [projection](../../projection/main/README.md)

Invariant: resolution is by `status.boundNamespace`, so a silo always maps to exactly one org. The
self-seed is idempotent and never overwrites an existing spec (a human may be provisioning by
hand), and every boot-time seed is best-effort — a hiccup is logged and retried next boot rather
than blocking start-up. The scope guard is **fail-closed**: outside dev-auth mode, a missing
session or a caller who does not own the target silo is denied `403`, and global-scoped mutations
are operator-only.

## Public surface

- `_ResolveOwnClusterTenant` / `_ResolveOwnClusterTenantName` — the single discovery of the org bound to this silo's namespace.
- `_SeedOwnClusterTenant`, `_SeedOwnDefaultTenant`, and the default-tenant helpers/types — standalone boot seeding.
- `_OrgDomainProvisioner` (+ factory/types), `cert-manager` and `DNSEndpoint` clients — org public-domain provisioning.
- `_ClusterTenantScopeGuard`, `_ResolveCallerClusterTenant` — the per-router mutation guard and the fail-closed email→owner lookup.

## Boundary

Consumed by the projection membership loop (via org resolution), by the auth / provider / model
routes (via the scope guard and caller resolution), and by boot. It resolves and seeds org
identity; it does not run the membership projection or serve provider routes itself.

## Dependency direction

Tagged `scope:cluster-tenants`: it may depend only on `scope:auth`, `scope:cluster-tenants`,
`scope:k8s-api`, and `scope:shared` — never on apps or sibling domains.

## Data & persistence

Owns `OrgMembership` (with the `OrgRole` and `OrgMemberStatus` enums) in
`apps/opencrane/prisma/schema/cluster-tenants.prisma`. The ClusterTenant itself is a Kubernetes CR,
not a Prisma model.

## See also

- Parent index: [tenancy](../../README.md)
- Siblings: [connections](../../connections/main/README.md) · [contract](../../contract/main/README.md) · [projection](../../projection/main/README.md) · [tenants](../../tenants/main/README.md)
