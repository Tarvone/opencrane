# agent-runtime — the isolated personal-agent process

> [apps](../README.md) › agent-runtime

<!-- No import alias: this Python application is a deployable process, not an importable package. -->

## What it owns

The agent runtime is the process in which one personal-agent attempt will eventually execute. It
runs inside the customer's isolated Kubernetes namespace, opens its own authenticated connection to
OpenCrane, and never accepts inbound network traffic.

This slice removes the shared long-lived Deployment and defines the fresh, initially suspended Job
that contains this process for one attempt. The agent controller creates that Job from durable run
authority and reports its Kubernetes-issued identity to OpenCrane; it does not yet bootstrap or
unsuspend it. The runtime itself still ignores commands until later dispatch/executor authority is
connected.

```text
 durable run attempt
        │  controller creates and assigns the suspended Job
        ▼
 ┌──────────────────────────────┐
 │  agent-runtime  ◄── HERE      │  outbound command stream; no listener
 └──────────────┬───────────────┘
                │ later: candidate events and action requests
                ▼
 OpenCrane server authority
```

**In this flow:** [OpenCrane server](../opencrane/README.md) ·
[runtime resource builder](../../libs/backend/agents/runtime/k8s-launcher/README.md) ·
[runtime stream](../../libs/server/_infra/agent-runtime-stream/README.md)

Invariant: this process cannot choose its user, agent revision, run, tools, permissions, or durable
state. A failed or retried attempt receives a different Job identity, and runtime-local files
disappear with its bounded scratch volume. If identity or server authority is unavailable, the
process reconnects with bounded backoff and does no work.

## Public surface

`Entrypoint: src/runtime.py` reads the mounted projected credential at connection time, opens the
runtime-initiated stream, rejects any individual response line above 64 KiB, and reconnects safely
when the connection ends. Commands are intentionally logged as ignored in this slice and never
executed; full command-size admission belongs to the later executor boundary.

## Boundary

The process has no listener, Service, Ingress, Kubernetes role-based access control (RBAC), model
provider credential, tool implementation, artifact credential, database client, or persistent tenant
mount. It does not decide which run it may execute; OpenCrane validates the exact Job, Pod,
ServiceAccount, attempt, and revision before admitting work.

It also has no static Helm workload. Installing one shared Deployment would blur user and attempt
identity, so the image may run only as the fresh Job contract defined by this slice. Durable memory
or artifacts must cross an authenticated OpenCrane service boundary rather than remaining inside the
runtime.

## Dependency direction

Tagged `type:app`, `layer:entrypoint`, and `scope:agent-runtime`. It is a deployable process at the top
of the dependency graph; libraries do not import it. The wire contract is owned by
`@opencrane/contracts`, and the server-side transport is owned by `libs/server/_infra`.

## Runtime & config

- `OPENCRANE_RUNTIME_STREAM_URL` — exact in-cluster OpenCrane stream endpoint.
- `OPENCRANE_RUNTIME_TOKEN_PATH` — rotating audience-bound projected-token path.
- `POD_UID` — immutable Pod identity supplied through the Kubernetes downward API.
- Writable storage is only a per-attempt `emptyDir` capped at 1 GiB and mounted at `/tmp`.

The Job builder requires an immutable image digest plus bounded CPU, memory, deadline, and scratch.
The container runs as an unprivileged numeric user with a read-only root filesystem.

## Status

The current image proves the identity and outbound-stream boundary but deliberately ignores command
frames. The controller now creates or exact-adopts its NetworkPolicy and suspended Job and commits
the Job UID to OpenCrane. Bootstrap, unsuspension, durable dispatch, and the selected model/tool
executor are later Phase E slices, so this app cannot yet complete an agent run.

## See also

- Parent index: [apps](../README.md)
- Server transport: [agent-runtime-stream](../../libs/server/_infra/agent-runtime-stream/README.md)
- Per-attempt resources: [runtime/k8s-launcher](../../libs/backend/agents/runtime/k8s-launcher/README.md)
- Runtime protocol: [contracts](../../libs/contracts/README.md)
- Deployment composer: [deploy-k8s](../_infra/deploy-k8s/README.md)
