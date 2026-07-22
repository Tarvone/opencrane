# @opencrane/feat-central-agents — Slack → org-memory ingestion worker

> [apps](../README.md) › feat-central-agents

<!-- Deployable app, titled by its package name (`@opencrane/feat-central-agents`). -->

A **deployable app** is a thin process that composes libraries and ships as one container. Unlike the
other apps, this one is **not API-first**: it serves no product endpoints. It is a background
**ingestion worker** — a process that wakes on a timer, pulls new data from an external source, and
loads it somewhere. Here it pulls messages from Slack, cleans them up, and feeds them into the
organisation's shared memory so agents can later recall what the team has discussed.

## What it owns

It owns the **Slack → org-memory** pipeline. **Org memory** is OpenCrane's shared knowledge store,
provided by [Cognee](../_infra/cognee/README.md) — a service that turns documents into a searchable
knowledge graph. This worker is the piece that keeps that memory topped up from Slack.

It runs one full end-to-end process on a repeating timer (default every 15 minutes):

```
 Slack (conversations.history)
        │  1. fetch messages newer than the cursor
        ▼
 ┌────────────────────────────────┐        /healthz + /metrics
 │  feat-central-agents  ◄── HERE  │───────► (Kubernetes probes / scraping)
 │  2. normalise → 3. validate     │
 └──────┬───────────────────┬──────┘
        │ 5. save cursor     │ 4. push valid docs  (POST /v1/add)
        ▼                    ▼
   Postgres              Cognee org memory
   (harvesting_cursors)
```

**In this flow:** [cognee](../_infra/cognee/README.md) *(the org-memory service it writes to)* ·
[opencrane server](../opencrane/README.md) *(owns the Postgres + the cursor table it reuses)*

The ordered stages, each cycle:

1. **Load cursor** — a **cursor** is a saved bookmark of how far the last sync got (here, the newest
   Slack message timestamp already ingested), so each cycle only fetches what is new.
2. **Normalise** — convert raw Slack messages into a uniform document shape with owner, scope, and
   sensitivity metadata, so every source looks the same downstream.
3. **Validate** — check each document against the org-index schema; malformed records are dropped and
   never reach Cognee, so a bad payload cannot corrupt the shared knowledge graph.
4. **Push** — send each valid document to Cognee's `/v1/add` endpoint; deduplication is Cognee's job.
5. **Save cursor** — advance the bookmark only after the fetch succeeds.

Invariant: the cursor advances only on a successful fetch, so a crashed cycle re-fetches rather than
skipping messages — at-least-once ingestion, never silent gaps.

## Public surface

`Entrypoint: src/index.ts` (`_Main`) — no import barrel; this is a worker, not a library. It validates
config (failing fast on a missing variable), starts the health/metrics server, runs one sync cycle
immediately, then repeats on the interval, and binds bounded `SIGTERM`/`SIGINT` shutdown.

It exposes **only** two operational endpoints, not the product API: `GET /healthz` (liveness for
Kubernetes probes) and `GET /metrics` (per-source ingest counts and lag as JSON). Any other path is
`404`.

## Boundary

Stateless apart from the cursor row. It does **not** own a database schema, serve the OpenCrane API,
authenticate callers, or read back from Cognee — it is write-only into org memory. Connector logic
(Slack), normalisation, and validation are its own; everything else is delegated.

## Dependency direction

Tagged `scope:app`. It composes `@opencrane/observability` (structured logging + tracing) and
`@prisma/client`; nothing imports it.

## Data & persistence

Reuses the **opencrane server's** Postgres via `DATABASE_URL`, reading and writing a single row per
source in the `HarvestingCursor` model (`harvesting_cursors` table). That model is **owned by the
server**, in `apps/opencrane/prisma/schema/awareness.prisma` — this worker is only a consumer of it and
defines no schema of its own.

## Runtime & config

Read from the environment at startup; the process refuses to start if a required variable is missing.

| Variable | Purpose | Default |
|---|---|---|
| `SLACK_BOT_TOKEN` | Slack bot token for `conversations.history` | *(required)* |
| `SLACK_CHANNEL_IDS` | Comma-separated channel IDs to harvest | *(required)* |
| `COGNEE_ENDPOINT` | Base URL of the Cognee org-memory service | *(required)* |
| `DATABASE_URL` | Postgres URL for cursor persistence | *(required)* |
| `SLACK_MAX_MESSAGES_PER_CYCLE` | Fetch cap per cycle | `200` |
| `SLACK_SYNC_INTERVAL_MS` | Time between sync cycles | `900000` (15 min) |
| `METRICS_PORT` | Port for `/healthz` + `/metrics` | `9090` |

Built into `dist/apps/feat-central-agents` by esbuild and imaged from `deploy/Dockerfile`, with the
repository root as build context (so the `@opencrane/observability` workspace dependency resolves).

## See also

- Parent index: [apps](../README.md)
- Writes to: [cognee](../_infra/cognee/README.md)
- Sibling apps: [opencrane server](../opencrane/README.md) · [feat-openclaw-tenant](../feat-openclaw-tenant/README.md)
