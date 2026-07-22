# langfuse — vendored LLM observability

> [apps](../../README.md) › [_infra](../README.md) › langfuse

<!-- A vendored-infra app: a pinned third-party product we run and wrap in Helm. No import
     alias — the deliverable is a pinned upstream-chart wrapper. Named by `project.json` (`langfuse`). -->

## What it owns

A **vendored infra app** is a third-party product OpenCrane runs as-is and wraps in Helm. This one wraps
[Langfuse](https://github.com/langfuse/langfuse), an **LLM-observability** platform — it records model
calls (prompts, responses, latency, cost, traces) so operators can see and debug what the assistants
are doing.

**Why we run it.** OpenCrane's model traffic needs a place to be traced and inspected; Langfuse is that
place. Unlike the other infra apps, this one does **not** fork or re-template the chart — the silo
umbrella (`apps/_infra/deploy-k8s/Chart.yaml`) consumes the upstream `langfuse` chart **directly** so
parent values, release names, and every rendered object stay identical to upstream. This project owns
only the **pin**: the exact upstream version, recorded here and in `upstream.yaml`, changed deliberately
alongside the umbrella lockfile.

When `langfuse.inCluster.enabled` is set, that upstream wrapper owns all six rendered pod classes:

- Langfuse web `Deployment`
- Langfuse worker `Deployment`
- S3-compatible object-store `Deployment`
- ClickHouse `StatefulSet`
- Redis primary `StatefulSet`
- ZooKeeper `StatefulSet`

## Public surface

`Entrypoint:` `upstream.yaml` — the pinned dependency record (chart `langfuse`, version `1.5.37`,
repository `https://langfuse.github.io/langfuse-k8s`, condition `langfuse.inCluster.enabled`). No
importable code and no local templates.

## Boundary

OpenCrane owns *only the version pin and the enable condition*; the vendor owns every rendered object
and the product itself. A pinned exact version (not a `>=` range) is deliberate: the deploy engine
resolves dependencies from `Chart.lock` via `helm dep build`, so an open range would let a deploy
silently ship an untested newer Langfuse.

## Dependency direction

An app entrypoint (`type:app`, `scope:langfuse`); its pin is consumed by the silo umbrella chart, and it
imports no package.

## Runtime & config

- **Pinned upstream chart:** `langfuse` `1.5.37` from `https://langfuse.github.io/langfuse-k8s`.
- `langfuse.inCluster.enabled` — the condition that renders the whole upstream stack.
- All other knobs are upstream Langfuse chart values, set through the umbrella parent values; its
  Postgres connection comes from [`apps/postgres`](../../postgres/README.md).

## See also

- Parent index: [_infra](../README.md)
- Silo chart that pins/consumes it: [deploy-k8s](../deploy-k8s/README.md)
- Database it uses: [apps/postgres](../../postgres/README.md)
- Sibling infra: [cognee](../cognee/README.md) · [litellm](../litellm/README.md) · [obot](../obot/README.md)
