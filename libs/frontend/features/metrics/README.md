# @opencrane/features/metrics — the AI-usage metrics dashboard

> [frontend](../../README.md) › [features](../README.md) › metrics

## What it owns

This is a frontend **feature** package (a lazy-loaded route plus its components — the browser only
downloads its code when the route is first opened). It owns an AI-usage and cost dashboard: for a
selectable date range it fetches usage data, derives per-period summary totals, and renders both a
summary row and a sortable per-day table.

The data comes from the model-routing metrics endpoint (`/model-routing/metrics`), which is backed
by Langfuse (the observability service that records model calls and cost). The page reads it through
the typed API service from `core` rather than calling `fetch` directly, and it maps backend error
codes to plain messages (for example, "metrics backend is not configured on this instance").

## Public surface

- `METRICS_ROUTES` — the lazy route table for the dashboard.
- `MetricsPageComponent` — the full-page dashboard (range picker, summary row, per-day table).
- `metrics.types` / `metrics.util` — the row/summary shapes and the pure query-build, parse, and
  summarise helpers.

## Boundary

`METRICS_ROUTES` is exported but is **not currently mounted** in the route table of the
web app (`apps/opencrane-ui`); the feature is complete and importable, awaiting a mount point. It reads
metrics through `core`'s API service and does not mutate anything.

## Dependency direction

Tagged `scope:web` (the frontend dependency tier): it may import only other `scope:web` packages
and `scope:shared` contracts. It depends on `@opencrane/core` for the typed API service.

## See also

- Parent index: [features](../README.md)
- API service: [core](../../core/README.md)
