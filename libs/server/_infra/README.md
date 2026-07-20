# _infra — the server's runtime seams

> [server](../README.md) › _infra

These libraries are the machinery the `apps/opencrane` server process wraps around its business
domains: how requests arrive, who is let in, how it talks to Kubernetes, and where a tenant's data
is hosted. They are kept apart from `libs/backend/server` on purpose so that transport and plumbing
never look like a business capability. Each is owned by the server and by nothing else.

## Map

| Package | What it owns |
| --- | --- |
| [`api`](./api/README.md) | Kubernetes API plumbing. |
| [`auth`](./auth/README.md) | OIDC login and authorization substrate. |
| [`channel-proxy`](./channel-proxy/README.md) | The blue OpenClaw gateway proxy. *(frozen — see below)* |
| [`http`](./http/README.md) | Express transport plumbing. |
| [`obot-custody`](./obot-custody/README.md) | The Obot credential-custody port. |
| [`tenant-hosting`](./tenant-hosting/README.md) | The hosting-substrate adapter. |

```
   inbound request
        │
      http ──► auth ──► (server routes + backend domains)
                          │
   api (Kubernetes) ◄─────┤
   tenant-hosting ◄───────┤
   obot-custody ◄─────────┘
   channel-proxy ── blue OpenClaw gateway path (frozen)
```

`channel-proxy` here is the **blue** proxy — bound to the frozen OpenClaw runtime and slated for
deletion with it. Do not build new work on it; the green channel entry lives in `apps/channel-proxy`.

## Dependency rule for this tier

These carry `layer:infra`. They may use models, contracts, utilities, observability, and other
`_infra` peers — but must **not** import a backend business domain (`libs/backend/server/*`), a
frontend package, or an application entrypoint. Public imports use
`@opencrane/server/_infra/<library>`.

## See also

- Parent index: [`libs/server`](../README.md)
- Business capabilities that consume these seams: [`libs/backend/server`](../../backend/server/README.md)
