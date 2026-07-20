# @opencrane/backend/server/reporting/spend — LLM spend, budgets & virtual keys

> [backend](../../../../README.md) › [server](../../../README.md) › [reporting](../../README.md) › spend

## What it owns

This package is part of **Reporting** — the economics side of OpenCrane. It owns how much a tenant
is spending on model calls, the budget ceilings that cap that spend, and the per-tenant **virtual
key** metadata used to call models. Model traffic flows through **LiteLLM**, the gateway/proxy
OpenCrane runs in front of every model provider; a virtual key is a scoped credential LiteLLM
issues per tenant so its usage and budget can be tracked and revoked independently.

It sits between LiteLLM and the operator's spend views, reading live usage and exposing budget and
key controls:

```
 dashboard / operator                       tenant deletion (kill path)
        │  GET spend · budgets · key                │  revoke
        ▼                                            ▼
 ┌───────────────────────────────────────────────────────────────┐
 │  spend   ◄── HERE                                               │
 │  · normalize LiteLLM usage  · global + per-account ceilings     │
 │  · virtual-key metadata + revoke (delete mounted Secret)        │
 └───────────────────────────────────────────────────────────────┘
        │  usage query                          │  key delete (by alias)
        ▼                                        ▼
 LiteLLM proxy  (spend + key APIs, master-key auth)
```

Invariant: OpenCrane never persists a raw virtual key — only its **alias** — so upstream deletion
is always by alias. Revocation is resilient: the mounted Kubernetes Secret delete is what actually
stops the pod from using the key, so a flaky or absent LiteLLM never blocks a revoke (the upstream
delete is best-effort and the outcome is recorded in the audit entry). A missing `LITELLM_MASTER_KEY`
fails closed with a `503` rather than guessing.

## Public surface

- `SpendLogic` — normalises a tenant's spend from the LiteLLM usage API (with tolerant field-picking and a local fallback).
- `_GetGlobalBudget` / `_PutGlobalBudget`, `_GetAccountBudgets` / `_PutAccountBudget` / `_DeleteAccountBudget` — the global and per-account monthly ceilings.
- `_GetTenantSpend`, `_GetLiteLlmKey`, `_RevokeLiteLlmKey`, `_deleteLiteLlmKey` — tenant spend summary and virtual-key metadata / revocation.
- The `spend`, `token-usage`, and `ai-budget` routers (mounted at `/api/v1/spend`, `/api/v1/token-usage`, `/api/v1/ai-budget`) and the spend types.

## Boundary

Consumed by the opencrane-server HTTP layer and by the tenants domain (which calls `_deleteLiteLlmKey`
when tearing a tenant down). It reports and controls spend; it does not route model calls itself —
that is LiteLLM's job.

## Dependency direction

Tagged `scope:spend`: it may depend only on `scope:spend` and `scope:shared` — never on apps or
sibling domains.

## Data & persistence

Owns `TenantLiteLlmKey`, `TokenUsageSnapshot`, `GlobalBudgetSetting`, and `AccountBudgetSetting` in
`apps/opencrane/prisma/schema/spend.prisma`.

## Runtime & config

Reads `LITELLM_ENDPOINT` (default `http://litellm:4000`), `LITELLM_MASTER_KEY` (required for spend
and key calls; absence fails closed), and `LITELLM_SPEND_PATH_TEMPLATE` (default
`/spend/tenant/{tenant}`).

## See also

- Parent index: [reporting](../../README.md)
- Siblings: [awareness](../../awareness/main/README.md) · [metrics](../../metrics/main/README.md)
