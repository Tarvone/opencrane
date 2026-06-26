# ADR 0002 — Per-ClusterTenant silo architecture (operator, planes, API/DB) by isolation tier

- **Status:** Proposed
- **Date:** 2026-06-26
- **Task:** `task_5164276f` (Phase 3 / S6 of the strict-multi-tenancy program)
- **Supersedes / superseded by:** none — **refines** [ADR 0001](0001-cluster-tenant-virtual-network-isolation.md), which chose the isolation *substrate* (Linkerd + the NetworkPolicy floor) and explicitly deferred the *placement* decisions (which planes move into the silo, the per-CT operator design, per-CT API/DB) to Phase 3 / this ADR.
- **Related:** [`silo-multi-tenant-plan.md`](../../silo-multi-tenant-plan.md) (§ Phase 3) · [`plan.md`](../../plan.md) (S6) · `platform/helm/values.yaml` (`multiInstance`, `sharedPlatform`)

## Context

ADR 0001 settled the *boundary*: each ClusterTenant is a strictly isolated silo, with a
per-silo default-deny `NetworkPolicy` floor (S2) and Linkerd mTLS identity + L7 authorization
(S5) layered on top, and the super-admin control-plane as the only cross-silo principal.

But the *brains* are still communal. As-built, `opencrane-system` runs **shared singletons**
that serve every tenant:

| Concern | As-built | Problem it creates |
|---|---|---|
| Operator | one operator reconciles all tenants | a single failure domain; one operator writes every org's ingress |
| Planes (Obot/MCP, skill-registry, LiteLLM, Cognee, tenant DB) | shared singletons | data/credentials co-resident; isolation rests entirely on app-level ACLs |
| Control-plane API + DB | one shared API + DB | the **resolution-ambiguity class**: the shared plane must constantly infer *which tenant* a request/row/resource belongs to — the root of a recurring family of bugs (default-tenant projection, cross-tenant lookups, the resolver patches), shimmed today by PR #68 |

This ADR decides **how much of the stack moves into the silo, and how that scales with
`ClusterTenant.spec.isolationTier`** — because moving *everything* per-tenant for *every*
tenant explodes footprint/cost (a `shared`-tier customer cannot justify a private LiteLLM +
Cognee + DB + operator). The decision must be tier-aware, reuse the machinery the chart
already has, and preserve per-org ingress.

Two pieces of existing machinery are load-bearing here:

- **`multiInstance`** — the chart can already run N strictly-isolated OpenCrane instances in
  one cluster, each with a namespace-scoped operator (`requireWatchNamespace`).
- **`sharedPlatform.<plane>.mode = instance | shared`** — each plane (LiteLLM, skill-registry,
  Obot) is *already* switchable between a release-local instance and a referenced shared
  endpoint.

S6 is largely **applying these per-ClusterTenant**, not inventing a new mechanism.

## Decision

### 1. Plane placement scales with `isolationTier` (do not give every tenant a private stack)

| Tier | Operator | Planes (Obot/skills/LiteLLM/Cognee) | Tenant DB | Control-plane API |
|---|---|---|---|---|
| `shared` | **shared** (the platform operator) | **shared** (`sharedPlatform.*.mode=shared`) + strict per-CT ACL/partitioning + S2/S5 isolation | shared DB, **logically** partitioned per-CT | shared (super-admin) |
| `dedicatedNodes` | **per-CT** (namespace-scoped, on the tenant's node pool) | **per-CT instance** (`mode=instance`) | **per-CT DB instance** | shared super-admin + **per-silo tenant API** |
| `dedicatedCluster` | per-CT, in a vcluster/Kamaji control plane | per-CT, in the vcluster | per-CT, in the vcluster | per-silo, in the vcluster |

Rationale: physical per-CT planes are an isolation *upgrade a customer buys*, not a default.
The `shared` tier gets its isolation from S2/S5 + app-level scoping (cheap, dense); dedicated
tiers get progressively more physical separation. This is the cost-sane reading of the silo
model and it tracks ADR 0001's substrate-by-tier table exactly.

### 2. The super-admin control-plane stays the *only* shared cross-silo plane

The fleet/provisioning/billing control-plane remains shared in `opencrane-system` (consistent
with ADR 0001: super-admin is the only cross-silo principal). It operates on **named**
ClusterTenants — provisioning org X, listing the fleet — which is **unambiguous by
construction** (no resolution needed; the CT name is the input). What moves out is the
*tenant-facing* data + API surface, so the shared plane never has to guess a caller's tenant.

### 3. Per-CT API + DB retires the resolution-ambiguity class

- **Dedicated tiers:** the tenant-facing control-plane API + DB run **inside the silo**, scoped
  to one tenant. There is nothing to resolve — the silo *is* the scope.
- **`shared` tier:** the data is **logically** partitioned per-CT (the per-CT scoping already
  built across S3/S4), with the shared API enforcing the scope. Resolution-ambiguity is killed
  not by physical separation but by making every tenant-facing query explicitly silo-scoped and
  the shared plane do **only** named-CT admin.
- Either way, **PR #68's resolution shim is retired**: the shared plane stops inferring tenancy
  from request shape.

### 4. Per-CT operator owns its silo's north-south edge

When a dedicated silo gets its own operator (via the existing `multiInstance` +
`requireWatchNamespace` machinery, reparented under `ClusterTenantProvisioner`), **that**
operator owns its silo's `{org}.{base}` Ingress + `DNSEndpoint` + cert binding, scoped to its
namespace — never a shared operator writing every org's ingress. This must be **fail-closed**:
a silo with no ingress is *unreachable*, never cross-wired to another org's host. The `shared`
tier keeps the single shared operator emitting per-org ingress (today's Track-DOMAIN behavior).

### 5. `dedicatedCluster` is an arm's-length provisioner (the AGPL/WeOwnAI seam)

The strongest tier provisions a vcluster/Kamaji control plane per silo via an out-of-process
`ClusterTenantProvisioner` backend — kept arm's-length so it stays the AGPL / WeOwnAI
enterprise seam rather than baked into the default substrate (consistent with ADR 0001).

## Implementation shape (post-acceptance; split into tasks)

1. **Provisioner reparent** — model a dedicated silo as a `multiInstance` instance the
   `ClusterTenantProvisioner` stamps out (namespace + scoped operator + `mode=instance` planes
   + per-CT DB), gated by `isolationTier`.
2. **Per-CT operator** — promote the namespace-scoped operator to be provisioned per dedicated
   CT; move per-org ingress/DNS ownership into it (fail-closed).
3. **Tenant API/DB split** — separate the super-admin (cross-silo, named-CT) surface from the
   tenant-facing (silo-scoped) surface; per-CT DB for dedicated tiers, logical partition for
   `shared`; delete the #68 resolution shim.
4. **Tier wiring** — `isolationTier` drives shared-vs-instance plane mode + operator topology
   (feeds S7's cost/footprint model).

## Alternatives considered

- **Per-CT everything, all tiers** — full private stack (operator + planes + DB) for every
  tenant regardless of tier. **Rejected:** footprint/cost is untenable for dense `shared`-tier
  customers; isolation for `shared` is already met by S2/S5 + ACL.
- **Keep everything shared, isolate only at the network/identity layer (S2/S5 only)** —
  **rejected** as the end state: it leaves the resolution-ambiguity class and co-resident
  data/credentials, and gives dedicated-tier customers nothing physical to buy. Acceptable
  *only* as the `shared` tier's posture, not the platform's.
- **A brand-new per-CT deployment mechanism** — **rejected** in favor of reusing the existing
  `multiInstance` + `sharedPlatform.mode` machinery; a parallel mechanism would duplicate the
  isolation surface and diverge.

## Consequences

- **Unblocks S8/S9/S10.** Obot OBO brokering (S8), Zot skill storage (S9), and the
  provider-secret cutover (S10) all need to know *where the planes live*; this ADR answers that
  per tier, so they can target the right placement.
- **Footprint scales with paid isolation, not tenant count.** Dense `shared` tier stays cheap;
  dedicated tiers cost more by design — quantified by S7 (tiers & cost).
- **New per-silo failure domains + ops surface** at dedicated tiers (N operators, N plane
  stacks, N DBs). Monitoring and upgrade orchestration must become fleet-aware.
- **A migration, not a flag-day.** Existing tenants stay `shared` (no change); a tenant moves to
  a dedicated tier by being re-provisioned into its own instance. The per-CT operator/API/DB and
  the #68-shim retirement land incrementally behind the tier gate.
- **`shared`-tier isolation is explicitly app-level + S2/S5**, not physical — documented so an
  operator selling the `shared` tier states the boundary honestly.
