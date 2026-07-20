# @opencrane/backend/server/reporting/metrics — product & Prometheus metrics

> [backend](../../../../README.md) › [server](../../../README.md) › [reporting](../../README.md) › metrics

## What it owns

This package is part of **Reporting** — the observability side of OpenCrane. It owns the read-only
metrics surface of the control plane: the JSON metrics the operator dashboard cards read, and the
**Prometheus** exposition endpoint the cluster scrapes. Prometheus is the standard system that
periodically pulls (`scrapes`) numeric health signals from a service and stores them for alerting
and trend charts.

It is a pure read-and-render layer. It holds almost no state of its own — instead it gathers
signals from neighbouring domains and formats them two ways: a dashboard JSON payload, and the
Prometheus text format:

```
 dashboard poll  /api/v1/metrics        Prometheus scrape  /prom
        │                                        │
        ▼                                        ▼
 ┌───────────────────────────────────────────────────────────────┐
 │  metrics   ◄── HERE                                             │
 │  · server snapshot · projection-drift summary (+alert webhook)  │
 │  · tenant-phase gauges · awareness SLO gauges                   │
 └───────────────────────────────────────────────────────────────┘
        ▲ drift reports                 ▲ fleet participation report
        │                               │
 [projection]                     [awareness]
```

**In this flow:** [projection](../../../tenancy/projection/main/README.md) · [awareness](../../awareness/main/README.md)

Invariant: reporting must never blank on a partial failure. The Prometheus route emits the core
opencrane-server metrics first, then best-effort appends the awareness SLO block (service-level
objectives — the fleet-health numbers alerts fire on) — if that render throws, it is logged and the
core metrics still return. The drift-alert webhook is
fire-and-forget: the HTTP response is never blocked on webhook delivery. A stale or missing metric
degrades a dashboard; it never takes down the scrape a monitor depends on.

## Public surface

- `metricsRouter` (mounted at `/api/v1/metrics`) — server-utilisation snapshot and the detect-only projection-drift summary, with an optional threshold-triggered alert webhook.
- `prometheusMetricsRouter` (mounted at `/prom`) — tenant-phase gauges, audit-log counter, Node runtime gauges, and the appended awareness SLO metrics, in Prometheus text exposition format.
- The metrics response/row types.

## Boundary

Consumed by the operator dashboard and the cluster's Prometheus scraper. It reads projection-drift
reports from `projection` and the fleet participation report from `awareness`; it does not compute
drift or rollout state itself, and it owns no tenant or policy state.

## Dependency direction

Tagged `scope:metrics`: it may depend only on `scope:awareness`, `scope:metrics`,
`scope:projection`, and `scope:shared` — never on apps or sibling domains.

## Data & persistence

Owns only `ServerMetricSnapshot` in `apps/opencrane/prisma/schema/metrics.prisma`; every other
value it emits (tenant phases, audit count, drift, participation) is read from the domains that own
those models.

## See also

- Parent index: [reporting](../../README.md)
- Siblings: [awareness](../../awareness/main/README.md) · [spend](../../spend/main/README.md)
