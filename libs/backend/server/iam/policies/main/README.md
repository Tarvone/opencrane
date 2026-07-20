# @opencrane/backend/server/iam/policies — the network and tool boundary each tenant runs inside

> [backend](../../../../README.md) › [server](../../../README.md) › [iam](../../README.md) › policies

## What it owns

This package is part of **IAM** — *identity and access management*, the side of OpenCrane that
answers **who is making this request, and are they allowed to do this?** Policies owns the outer fence
around a tenant's running agents: which outside domains they may reach, what network egress is
allowed, and which tool servers (**MCP** servers — the Model Context Protocol connections that let an
agent use external tools) they may use.

An **AccessPolicy** is that fence written down. Operators create and edit policies through the API
(`/api/v1/policies`), and this package then **projects** each policy into the Kubernetes cluster —
rendering it into the real resources that constrain the tenant's pods, so the rule an operator typed
becomes an enforced boundary. A **tenant** is one isolated customer workspace; a policy is matched to
tenants by a selector. This package also keeps Cognee — the org-memory service — aware of the
policy's awareness rules.

```
 operator writes an AccessPolicy   POST/PUT /api/v1/policies
        │
        ▼
 ┌───────────────────────────────┐
 │   policies   ◄── HERE          │  store the rule, then reconcile it
 └───────────────────────────────┘
        │  PolicyResourceBuilder renders → PolicyOperator projects
        ▼
  the cluster enforces it on the tenant's pods (egress · allowed domains · MCP servers)
```

**In this flow:** [grants](../../grants/main/README.md) · projection *(the cluster-projection layer it reconciles through)*

Invariant: the cluster is a projection of the stored policy — the reconciler drives the live
resources toward what the policy says, so an operator's edit and the enforced boundary stay in step.
Mounted at `/api/v1/policies`.

## Public surface

- `policiesRouter` and its route types — the `/api/v1/policies` management API.
- `PolicyOperator` and `PolicyOperatorConfig` — the reconciler that projects stored policies into the
  cluster and keeps them converged.
- `PolicyResourceBuilder` — renders an `AccessPolicy`/`AccessPolicySpec` into the concrete cluster
  resources.
- `_PoliciesOpenapiPaths` — the OpenAPI (REST API description) path fragment this domain contributes to the aggregated spec.

## Boundary

Consumed by the server's HTTP composition root and by [api-spec](../../../api-spec/main/README.md);
its reconciler runs against the cluster. It owns the *coarse* per-tenant boundary (network and tool
reach), not the *fine* per-request decision on a single action — that is
[authorization](../../authorization/main/README.md).

## Dependency direction

Tagged `scope:policies`: it may depend only on `scope:grants`, `scope:k8s-api`, `scope:policies`,
`scope:projection`, and `scope:shared` — never on apps or other sibling domains.

## Data & persistence

Owns the `AccessPolicy` model in `apps/opencrane/prisma/schema/policies.prisma`.

## See also

- Parent index: [iam](../../README.md)
- Siblings: [grants](../../grants/main/README.md) · [groups](../../groups/main/README.md) · [authorization](../../authorization/main/README.md)
