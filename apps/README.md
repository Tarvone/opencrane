# Apps — the deployables

> [OpenCrane](../README.md) › apps

Everything here is a **deployable**: a thing that ships and runs — a server, a single-page app, a
worker, a database. Apps are thin. They compose libraries, wire up clients, and manage process
lifecycle; the actual product logic lives in [`libs`](../libs/backend/README.md). The rule is
**one `apps/<name>` per deployable, and logic lives in libs** — if you are writing behaviour worth
testing on its own, it belongs in a library, not here.

## Map

| Deployable | What it owns |
| --- | --- |
| [`opencrane`](./opencrane/README.md) | The per-silo server / control plane (REST API, reconcilers, gateway proxy). |
| [`opencrane-ui`](./opencrane-ui/README.md) | The org-admin single-page app. |
| [`channel-proxy`](./channel-proxy/README.md) | The inbound-channel edge trust boundary. |
| [`artifact-service`](./artifact-service/README.md) | The artifact promote-and-receipt service. |
| [`agent-runtime`](./agent-runtime/README.md) | Outbound-only personal-agent process designed for one suspended Job per attempt; controller follows next. |
| [`feat-central-agents`](./feat-central-agents/README.md) | The Slack-to-Cognee ingestion worker. |
| [`feat-openclaw-tenant`](./feat-openclaw-tenant/README.md) | The OpenClaw tenant runtime image. *(blue/frozen — deletion target)* |
| [`postgres`](./postgres/README.md) | The durable PostgreSQL deployable. |

Vendored third-party infrastructure (Cognee, LiteLLM, Obot, Langfuse, and the Kubernetes release
composer) lives one level down under [`apps/_infra`](./_infra/README.md) — see that index for the
service map.

```
   opencrane (control plane) ──serves──► opencrane-ui (SPA)
        │                                  channel-proxy (edge)
        ├── artifact-service · agent-runtime · feat-central-agents (workers)
        ├── postgres (durable DB)
        └── feat-openclaw-tenant (blue, frozen — dies at retirement)
   apps/_infra/ ── vendored infra + release composer
```

## Dependency rule for this tier

Apps carry `type:app` / `scope:app`. An app may compose any library, but it must **not** import
another app — deployables never depend on each other's source. `feat-openclaw-tenant` is a frozen
deletion boundary: do not add new functionality to it.

## See also

- Parent front door: [OpenCrane](../README.md)
- Vendored infra index: [`apps/_infra`](./_infra/README.md) · library capabilities: [`libs/backend`](../libs/backend/README.md)
