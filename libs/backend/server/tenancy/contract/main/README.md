# @opencrane/backend/server/tenancy/contract — effective tenant runtime contract

> [backend](../../../../README.md) › [server](../../../README.md) › [tenancy](../../README.md) › contract

## What it owns

This package is part of **Tenancy** — the domain that connects fleet state to a single silo. It
owns the **effective contract**: the compiled, up-to-the-minute answer to "what may this tenant's
agent do right now?", assembled on demand and served to the tenant pod. A **tenant** is one
customer's isolated workspace; its agent runs in a **pod** (a running container) and periodically
re-pulls this contract so a change to its entitlements takes effect without a redeploy.

It is one step in the runtime **contract loop**. It consumes the tenant's grants (permission
records), the awareness version its rollout wave should run, and its entitled skill models, then
renders `TOOLS.md` — the machine-readable file the agent reads to know its tools:

```
 tenant pod polls  /api/internal/contract  (projected ServiceAccount token)
        │  TokenReview (Kubernetes' API for checking a pod's own identity token) verifies the pod's own identity
        ▼
 ┌───────────────────────────────────────────────┐
 │  contract   ◄── HERE                            │
 │  assemble: grants + awareness version +         │
 │  entitled skill models  →  render TOOLS.md      │
 └───────────────────────────────────────────────┘
        │ effective contract (rendered TOOLS.md + entitlements)
        ▼
 pod rewrites TOOLS.md and reloads only when it changed
```

**In this flow:** [grants](../../../iam/grants/main/README.md) · [awareness](../../../reporting/awareness/main/README.md) · [tenants](../../tenants/main/README.md) · [model-routing](../../../gateways/model-routing/main/README.md)

Invariant: `TOOLS.md` renders **deterministically** — sections are sorted by name so the same
entitlement set is always byte-identical, because the pod diffs by content and a spurious reorder
would trigger a needless rewrite and reload. An empty section renders an explicit "none" line so
the agent can tell "nothing entitled" apart from "section missing". The endpoint authenticates the
pod inline via the Kubernetes TokenReview API (audience `opencrane-server`) and checks the
authenticated ServiceAccount matches the requested tenant — a pod can never read another tenant's
contract.

## Public surface

- `_RenderToolsMarkdown` — renders the platform-managed `TOOLS.md` from a tenant's entitled tools.
- `_RegisterInternalTenantContract` — the internal router (mounted at `/api/internal/contract`) that verifies the pod token and serves the assembled contract.
- The tools-markdown rendering types.

## Boundary

Consumed only by the tenant pod's background contract-polling loop; it is deliberately **not**
behind the standard auth middleware, relying instead on inline TokenReview plus NetworkPolicy for
defence in depth. It assembles and renders; it does not own grants, awareness, or tenant state — it
reads each from the domain that does.

## Dependency direction

Tagged `scope:contract`: it may depend only on `scope:awareness`, `scope:contract`, `scope:grants`,
`scope:model-routing`, `scope:tenants`, and `scope:shared` — never on apps.

## See also

- Parent index: [tenancy](../../README.md)
- Siblings: [cluster-tenants](../../cluster-tenants/main/README.md) · [connections](../../connections/main/README.md) · [projection](../../projection/main/README.md) · [tenants](../../tenants/main/README.md)
