# agent-runtime — the isolated personal-agent process

> [apps](../README.md) › agent-runtime

<!-- No import alias: this Python application is a deployable process, not an importable package. -->

## What it owns

The agent runtime is the process in which one personal-agent attempt will eventually execute. It
runs inside the customer's isolated Kubernetes namespace, opens its own authenticated connection to
OpenCrane, and never accepts inbound network traffic.

This first slice establishes the process and identity boundary only. The runtime proves which Pod it
is by presenting a short-lived Kubernetes credential, then keeps one outbound command stream open.
OpenCrane cannot send work yet: the server deliberately supplies an empty command authority until a
later Phase E slice binds the process to a durable run assignment.

```text
 personal run accepted by OpenCrane
               │  later: assigned command
               ▼
     OpenCrane internal listener
               ▲  projected identity + outbound stream
               │
 ┌────────────────────────────┐
 │  agent-runtime  ◄── HERE    │  no inbound listener; no executor yet
 └────────────────────────────┘
               │
               └── bounded temporary scratch only
```

**In this flow:** [OpenCrane server](../opencrane/README.md) ·
[runtime stream transport](../../libs/server/_infra/agent-runtime-stream/README.md) ·
[runtime protocol](../../libs/contracts/README.md)

Invariant: this process cannot choose its user, agent revision, run, tools, permissions, or durable
state. If identity or server authority is unavailable, it reconnects with bounded backoff and does no
work. A runtime compromise therefore does not become a route into Kubernetes or long-lived tenant
storage.

## Public surface

`Entrypoint: src/runtime.py` reads the mounted projected credential at connection time, opens the
runtime-initiated stream, rejects any individual response line above 64 KiB, and reconnects safely
when the connection ends. Commands are intentionally logged as ignored in this slice and never
executed; full command-size admission belongs to the later executor boundary.

## Boundary

The app owns no HTTP listener, Service, Ingress, Kubernetes role, model-provider credential, tool
implementation, database client, or persistent volume. It does not assemble run input, admit
candidate events, or write durable state. Those decisions remain in OpenCrane's personal-agent
authorities.

Its only writable filesystem is a bounded `emptyDir`, which Kubernetes deletes with the Pod. Any
future durable memory or artifact must cross an authenticated OpenCrane service boundary rather than
remaining inside the runtime.

## Dependency direction

Tagged `type:app`, `layer:entrypoint`, and `scope:agent-runtime`. It is a deployable process at the top
of the dependency graph; libraries do not import it. The wire contract is owned by
`@opencrane/contracts`, and the server-side transport is owned by `libs/server/_infra`.

## Runtime & config

- `OPENCRANE_RUNTIME_STREAM_URL` — internal OpenCrane stream endpoint in the same silo.
- `OPENCRANE_RUNTIME_TOKEN_PATH` — rotating projected-token file; reread for every connection.
- `POD_UID` — immutable Pod identity supplied by the Kubernetes downward API.

The image runs as an unprivileged numeric user with a read-only root filesystem. The chart is
disabled by default and supplies finite CPU/memory and `emptyDir` scratch defaults, which operators
may override. This initial chart still accepts a mutable image tag; the next Job-launcher slice
replaces it with an immutable digest requirement before any command execution is enabled.

## See also

- Parent index: [apps](../README.md)
- Server transport: [agent-runtime-stream](../../libs/server/_infra/agent-runtime-stream/README.md)
- Runtime protocol: [contracts](../../libs/contracts/README.md)
- Deployment composer: [deploy-k8s](../_infra/deploy-k8s/README.md)
