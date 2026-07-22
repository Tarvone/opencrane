# @opencrane/backend/server/knowledge/company-docs — company workspace docs & reconciliation

> [backend](../../../../README.md) › [server](../../../README.md) › [knowledge](../../README.md) › company-docs

## What it owns

This package is part of **Knowledge** — the side of OpenCrane that decides what an
organisation's agents can read and how they sound. A **tenant** is one customer's isolated
workspace (their own private slice of the platform); an agent runs inside it with a stack of
identity documents. Those documents come in layers: **L0** are platform-owned system files
(`AGENTS.md` / `TOOLS.md`) that OpenCrane re-stamps on every boot; **L1** are the shared company
documents that give a whole org its voice and identity (a file like `SOUL`); **L2** are a tenant's
own personal edits on top. This package owns the L1 documents, their version history, and the
merge that keeps a tenant's copy in step with company changes.

Mounted at `/api/v1/org/workspace-docs`, it is a versioned document store with a guarded publish
path and a three-way merge (base / company / tenant) that produces a review proposal rather than
overwriting anyone silently:

```
 author edits a company doc (e.g. SOUL)
        │  publish
        ▼
 ┌────────────────────────────────────┐
 │  company-docs   ◄── HERE            │  L0 guard: reject platform-mechanic prose
 │  · guard · immutable versions       │  → append version N, bump currentVersion
 │  · deterministic 3-way reconcile    │
 └────────────────────────────────────┘
        │  merge proposal (company wins; tenant-only additions kept)
        ▼
 tenant workspace doc (L2)  →  reviewed, then applied
```

Invariant: versions are append-only and immutable, and the new version row plus the
`currentVersion` bump happen in one database transaction so they can never diverge. The L0 guard
runs **before any write** and fail-closed rejects content that tries to assert platform mechanics
(core platform behaviour). If that guard were wrong, company or
tenant prose could try to redefine core behaviour — futile, since L0 is re-stamped anyway, but it
is refused regardless.

## Public surface

- `_PublishCompanyDocVersion`, `_GetCompanyDoc`, `_ListCompanyDocVersions`, `_GetCompanyDocVersion` — the L1 version store.
- `_AssertNoL0Directives` / `_FindL0Directives` — the L0 personalisation guard, reused by the publish path and the reconciler sandbox.
- `_DeterministicReconciler`, `_BuildDocMergeReconciler` — the dependency-free three-way merger (the seam a model-backed merger swaps into later).
- The reconciliation logic and the `companyDocsRouter`, plus their request/response types.

## Boundary

Consumed by the opencrane-server HTTP layer (the workspace-docs route) and the reconciliation
pipeline. It personalises voice and identity only — it never renders or edits L0 platform files,
and the guard guarantees it cannot. The merge is deliberately conservative: company content wins,
but a tenant's own added lines survive under a labelled addendum rather than being discarded.

## Dependency direction

Tagged `scope:company-docs`: it may depend only on `scope:auth`, `scope:company-docs`, and
`scope:shared` — never on apps or sibling domains.

## Data & persistence

Owns `CompanyDoc`, `CompanyDocVersion`, `TenantWorkspaceDoc`, and `DocMergeProposal` (with the
`DocProposalStatus` enum) in `apps/opencrane/prisma/schema/company-docs.prisma`.

## See also

- Parent index: [knowledge](../../README.md)
- Sibling: [retrieval](../../retrieval/main/README.md)
