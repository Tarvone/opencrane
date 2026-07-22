# @opencrane/server — per-silo control plane & authenticated API

> [apps](../README.md) › opencrane

<!-- Deployable app. Import alias `@opencrane/server` (see package.json `name`). -->

A **deployable app** is a thin process that composes backend libraries and ships as one container. This
one is the **OpenCrane server** — the *control plane* for a single silo. A **silo** is one customer's
fully isolated slice of the platform (its own namespace, database, and users); a **control plane** is
the brain that runs that slice — it answers the API and keeps the running system matching its
configuration. One server runs per silo, so a silo stands on its own.

This is the composition and deployment root of the whole backend: business logic lives in the libraries
under [`libs/backend/*`](../../libs/backend/server/README.md), and this app wires them together and owns
process bootstrap, config, routing, the database schema, and its own Helm deployment unit.

## What it owns

OpenCrane is **API-first** — every capability is a REST endpoint, and the web UI is just one more client
of that API. This server is where those endpoints live. It plays two roles at once:

- **Request path (synchronous).** It serves the authenticated REST API — tenant, policy, model, MCP
  (Model Context Protocol, the standard for connecting tools to agents), skill, awareness, spend, audit,
  and access-token routes — by mounting routers imported from the backend domain libraries behind a
  shared auth, rate-limit, and logging pipeline.
- **Reconcile path (background).** It runs **reconcilers** — loops that watch Kubernetes custom
  resources (Tenant, AccessPolicy) and steadily drive the silo's namespace to match them, plus a
  projection loop that repairs this silo's membership against the **fleet** (the cross-silo manager that
  tracks which customers exist). A reconciler means "make reality match the spec, then check again",
  forever.

```
 signed-in client ─HTTPS /api/v1/*─► org ingress ─┐   Tenant / AccessPolicy CRs
                                                   ▼            │ watch
                              ┌────────────────────────────┐    ▼
                              │  opencrane server ◄── HERE  │◄─ reconcile loops
                              │  auth → domain routers      │   (namespace → spec)
                              └──────────────┬─────────────┘
                                     reads / writes
                                             ▼
                          Postgres  +  libs/backend/* domain logic
```

**In this flow:** [libs/backend/server](../../libs/backend/server/README.md) *(the domain routers +
reconcilers it composes)* · [opencrane-ui](../opencrane-ui/README.md) *(the main API client)* ·
[deploy-k8s](../_infra/deploy-k8s/README.md) *(the silo umbrella chart that deploys it)*

Invariant: the public API and the workload-facing internal API are served on **two separate
listeners** (ports 8080 and 8081). Keeping the internal listener off the public ingress is the first
boundary. Sensitive workload routes, including the personal-agent runtime stream, additionally
verify a short-lived projected Kubernetes identity before accepting a request. If either layer were
collapsed, platform-only reconciliation or runtime authority could become publicly reachable.

## Public surface

`Entrypoint: src/index.ts` — boots the process: creates the Prisma and Kubernetes clients, starts the
public and internal listeners, starts the projection and OpenClaw-tenant lifecycles, and binds bounded
`SIGTERM`/`SIGINT` shutdown that drains both listeners, disconnects Prisma, and flushes telemetry.

- `createApp(prisma, customApi, coreApi, authApi)` — builds the public Express app (mounts every domain
  router). Exported so tests can drive it with injected clients.
- `createInternalApp(prisma, authApi)` — builds the internal-only Express app. The personal-agent
  runtime route verifies the calling Pod and currently injects an empty authority, so it can maintain
  a heartbeat connection but cannot receive commands or persist output.

## Boundary

Composition only: it must not contain business logic — that belongs in `libs/backend/*`. Reusable
infrastructure (auth middleware, HTTP hardening, DB helpers) lives in `libs/server/_infra/*`. Nothing
imports this app; it sits at the top of the dependency graph.

## Dependency direction

Tagged `type:app`, `layer:entrypoint`, `scope:opencrane`. As an entrypoint it may compose any
`libs/backend/*` domain library, `libs/server/_infra/*`, and `@opencrane/observability`; no library may
import back into it.

## Data & persistence

Owns the silo's Prisma schema, split per domain under `prisma/schema/*.prisma`, and one greenfield
initializer at `prisma/migrations/0001_target_baseline/migration.sql`. The runs slice binds every
`AgentRun` to exactly one immutable
`RunInputSnapshot` by run, digest, thread, silo, service, revision and effective-contract coordinates,
and commits its initial acceptance and dispatch events in the same transaction. A partial or
mismatched admission therefore cannot commit. The initializer includes the reviewed PostgreSQL
functions and triggers that enforce authority invariants Prisma cannot express.
The migrate init-container applies it to a new database with `prisma migrate deploy`. During a CNPG
restore it waits at most three wall-clock minutes for the PostgreSQL Service endpoint to accept a TCP
connection, then runs Prisma exactly once. Schema, permissions, and migration-history errors still
fail immediately. OpenCrane does not carry an upgrade path or data migration from an older product
schema.

## Runtime & config

Read from the environment at startup.

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Public listener port | `8080` |
| `INTERNAL_PORT` | Workload-facing internal listener port | `8081` |
| `DATABASE_URL` | Postgres connection string (Prisma) | *(required)* |
| `NAMESPACE` | Silo namespace the reconcilers act on | `default` |
| `WATCH_NAMESPACE` | Namespace member workspaces are seeded into | falls back to `NAMESPACE` |
| `FLEET_INTERNAL_URL` | Fleet membership write-through URL; empty = standalone silo | *(empty)* |
| `OPENCRANE_API_TOKEN` | Token for fleet-internal calls | *(empty)* |
| `OPENCRANE_PROJECTION_REPAIR_INTERVAL_SECONDS` | Projection-repair loop cadence | `60` |

Built into `dist/apps/opencrane` by esbuild and imaged from `deploy/Dockerfile`
(`ghcr.io/italanta/opencrane-server`), with the repository root as build context. Its Helm chart under
`helm/` is a named-template library (Deployment, RBAC, Services, ingress, certificate, NetworkPolicy)
composed by the silo umbrella chart — see [`HELM.md`](./HELM.md).

## See also

- Parent index: [apps](../README.md)
- Composed logic: [libs/backend/server](../../libs/backend/server/README.md)
- Sibling apps: [opencrane-ui](../opencrane-ui/README.md) · [artifact-service](../artifact-service/README.md) · [feat-central-agents](../feat-central-agents/README.md)
