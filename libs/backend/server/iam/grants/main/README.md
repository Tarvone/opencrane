# @opencrane/backend/server/iam/grants — turns "who shared what" into "who can see what"

> [backend](../../../../README.md) › [server](../../../README.md) › [iam](../../README.md) › grants

## What it owns

This package is part of **IAM** — *identity and access management*, the side of OpenCrane that
answers **who is making this request, and are they allowed to do this?** Grants owns the rules that
say a subject (a person or a group) may access something, and the logic that turns a pile of those
rules into a single, definite answer for a given subject.

A **grant** is one allow-record: "this subject may access this thing, at this scope". People create
grants by **sharing** — a user shares a tool they hold with a colleague, or a file with a small set of
people. This package owns the sharing API (`/api/v1/shares`, `/api/v1/resource-shares`), the **grant
compiler** that resolves many overlapping grants into one decision (expanding groups to their members
and applying precedence so a more specific or higher-priority grant wins), and the **derived dataset
membership** that tells the knowledge layer which datasets a person may retrieve from. It also keeps
Cognee — the org-memory service — in sync with those awareness grants.

```
 user shares a tool / file    POST /api/v1/shares · /resource-shares
        │  (groups supply their members)
        ▼
 ┌───────────────────────────────┐
 │   grants   ◄── HERE            │  compile grants → one decision per subject
 └───────────────────────────────┘
        │  derived dataset membership          awareness sync
        ▼                                        ▼
  knowledge retrieval sees what a user may read   Cognee org-memory
```

**In this flow:** [groups](../../groups/main/README.md) · knowledge retrieval *(consumes derived dataset membership)*

Invariant: the compiler is deterministic — the same grants always produce the same decision, with a
defined precedence so overlaps never resolve ambiguously. Derived dataset membership is a projection
of the grants, never a second source of truth.

## Public surface

- The grant compiler in `core/grant-compiler` — resolves a subject's grants into a `CompiledGrantDecision`.
- `core/derive-dataset-membership` — projects grants into the dataset membership (per tenant, i.e.
  per customer workspace) the knowledge layer reads.
- `core/cognee-awareness-sync` — keeps Cognee's awareness grants aligned with the compiled state.
- The share routes (`routes/shares`, `routes/resource-shares`) and their types — the inter-user and
  direct-resource sharing APIs.
- `_GrantsOpenapiPaths` — the OpenAPI (REST API description) path fragment this domain contributes to the aggregated spec.

## Boundary

Consumed by the server's HTTP composition root, by [api-spec](../../../api-spec/main/README.md), and
by the knowledge layer that reads derived dataset membership. It resolves *entitlement*; it does not
run the per-request runtime allow/deny with cryptographic proof — that is
[authorization](../../authorization/main/README.md).

## Dependency direction

Tagged `scope:grants`: it may depend only on `scope:auth`, `scope:grants`, `scope:retrieval`, and
`scope:shared` — never on apps or other sibling domains.

## Data & persistence

Owns the `Grant` model in `apps/opencrane/prisma/schema/grants.prisma`.

## See also

- Parent index: [iam](../../README.md)
- Siblings: [groups](../../groups/main/README.md) · [policies](../../policies/main/README.md) · [authorization](../../authorization/main/README.md)
