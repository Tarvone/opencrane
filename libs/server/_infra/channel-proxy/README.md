# @opencrane/server/_infra/channel-proxy — the blue OpenClaw gateway proxy

> [server](../../README.md) › [_infra](../README.md) › channel-proxy

> **Status: blue, deletion-boundary.** This is the *old* gateway proxy bound to the frozen OpenClaw
> platform. Its only consumer is [`feat-openclaw-tenant`](../../../backend/feat-openclaw-tenant/main/README.md),
> and it is deleted together with that package when the OpenClaw runtime is retired. Do not build new
> work on it — the current channel proxy is [`backend/channel-proxy`](../../../backend/channel-proxy/main/README.md)
> plus the [`apps/channel-proxy`](../../../../apps/channel-proxy/README.md) deployable.

## What it owns

This library is the **WebSocket gateway proxy** for the legacy OpenClaw runtime. A WebSocket is a
long-lived, two-way browser-to-server connection; the "gateway" is the channel an OpenClaw agent pod
exposes for live chat. This proxy sits in front of that pod, checks each connection, and forwards it
on — folded into the operator process rather than run as its own deployment.

```
 browser WebSocket upgrade  (wss://org-host/gateway)
          │
          ▼
 ┌────────────────────────────┐
 │  _infra/channel-proxy       │  origin check · rate limit · delegated auth+routing
 │  (GatewayProxyServer) ◄HERE │  → strip /gateway prefix
 └────────────────────────────┘
          │  forwarded upgrade  (to the pod gateway at /)
          ▼
 OpenClaw agent pod  (blue runtime)
```

**In this flow:** [feat-openclaw-tenant](../../../backend/feat-openclaw-tenant/main/README.md)
*(sole consumer — embeds this server in its runtime lifecycle)*

`GatewayProxyServer` runs its own HTTP server on a dedicated port with `/healthz` and `/readyz`
probes, validates the request **origin** (which site opened the connection), applies a fixed-window
per-subject rate limit, and **delegates every auth and routing decision to the control plane** — it
holds no Kubernetes client and no secrets. It strips the external `/gateway` path prefix so the
upstream pod (whose gateway listens at `/`) sees the path it expects. Invariant: no connection
reaches a pod without passing the origin, rate, and delegated-auth checks.

**How it differs from its neighbours** — three things share the name "channel-proxy":

- **this package** (`server/_infra/channel-proxy`) — the *transport* server for the **blue OpenClaw**
  pod gateway, embedded in the operator; blue, dies with `feat-openclaw-tenant`.
- **[`backend/channel-proxy`](../../../backend/channel-proxy/main/README.md)** — the *current* reusable
  domain logic (forwarding, origin policy, rate limiting, the `OpenCraneTargetResolver`).
- **[`apps/channel-proxy`](../../../../apps/channel-proxy/README.md)** — the *current* standalone
  deployable app that composes that domain logic.

## Public surface

- `GatewayProxyServer`, `GatewayProxyServerConfig` — the embeddable proxy HTTP server.
- `gateway-proxy/proxy` — the WebSocket upgrade handler and `/gateway` prefix stripping.
- `gateway-proxy/auth-client` — the delegated target/auth resolver call to the control plane.
- `gateway-proxy/origin`, `gateway-proxy/rate-limit` — origin allow-listing and the fixed-window limiter.

## Boundary

Consumed only by `feat-openclaw-tenant`, which embeds the server in its runtime lifecycle. It carries
WebSocket traffic and enforces origin/rate/auth checks; it makes no routing or authorization decision
itself (all delegated) and holds no cluster access or secrets.

## Dependency direction

Tagged `scope:channel-proxy` (`layer:infra`): it may depend only on `scope:channel-proxy` and
`scope:shared` packages — never on backend domains, the frontend, or app entrypoints.

## See also

- Parent index: [_infra](../README.md) · [server libraries](../../README.md)
- Siblings: [api](../api/README.md) · [auth](../auth/README.md) · [http](../http/README.md) · [tenant-hosting](../tenant-hosting/README.md) · [obot-custody](../obot-custody/README.md)
- Current replacement: [backend/channel-proxy](../../../backend/channel-proxy/main/README.md) · [apps/channel-proxy](../../../../apps/channel-proxy/README.md)
