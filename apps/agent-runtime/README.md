# agent-runtime — outbound-only personal-agent process

> [apps](../README.md) › agent-runtime

## What it owns

This app owns the process image that executes one attempt of a user's personal agent. The dedicated
agent controller creates a fresh, initially suspended Kubernetes Job for each attempt; after durable assignment
is committed, the Job starts this process and it opens one authenticated stream back to the server.

```
 durable run attempt
        │  controller creates and assigns a suspended Job
        ▼
 ┌──────────────────────────────┐
 │  agent-runtime  ◄── HERE      │  outbound command stream; no listener
 └──────────────┬───────────────┘
                │ candidate events and action requests
                ▼
 OpenCrane server authority
```

**In this flow:** [OpenCrane server](../opencrane/README.md) ·
[runtime resource builder](../../libs/backend/agents/runtime/k8s-launcher/README.md) ·
[runtime stream](../../libs/server/_infra/agent-runtime-stream/README.md)

Invariant: the process has no durable tenant storage or independent authority. A failed or retried
attempt receives a different Job and identity; runtime-local files disappear with its bounded scratch
volume.

## Public surface

`Entrypoint: src/runtime.py` — reads the projected runtime token, opens the server command stream,
and consumes its bounded event framing without executing commands yet. `deploy/Dockerfile` packages
that process as the runtime image.

## Boundary

The process has **no listener, Service, Ingress, Kubernetes role-based access control (RBAC), model
provider credential, tool implementation, artifact credential, or persistent tenant mount**. It does
not decide which run it may execute; the server validates the exact Job, Pod, ServiceAccount, attempt,
and revision before admitting work.

It also has no static Helm workload. Installing one shared Deployment would blur user and attempt
identity, so the image may run only as the fresh Job defined by this slice. The next controller slice
will create that Job from durable run authority; this slice does not submit it to Kubernetes.

## Dependency direction

Tagged `type:app`, `layer:entrypoint`, `scope:agent-runtime`. It consumes the wire contract over HTTP
and does not import another app or own backend business logic.

## Runtime & config

- `OPENCRANE_RUNTIME_STREAM_URL` — required in-cluster server endpoint.
- `OPENCRANE_RUNTIME_TOKEN_PATH` — required path to the audience-bound projected token.
- `POD_UID` — required Kubernetes Pod identity supplied through the downward API.
- Writable storage is only an `emptyDir` capped at 1 GiB and mounted at `/tmp`.

## Status

The current image proves the identity and outbound-stream boundary but deliberately ignores command
frames. Durable dispatch and the selected model/tool executor are the next Phase E slices; this app
cannot yet complete an agent run.

## See also

- Parent index: [apps](../README.md)
- Server transport: [agent-runtime-stream](../../libs/server/_infra/agent-runtime-stream/README.md)
- Per-attempt resources: [runtime/k8s-launcher](../../libs/backend/agents/runtime/k8s-launcher/README.md)
- Runtime protocol: [contracts](../../libs/contracts/README.md)
