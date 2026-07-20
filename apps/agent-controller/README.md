# agent-controller — agent workload mutation boundary

> [apps](../README.md) › agent-controller

## What it owns

The agent controller is the sole OpenCrane process allowed to create personal-agent workloads in a
customer **silo**, meaning that customer's isolated namespace. It has no inbound listener: it polls
OpenCrane for authorised desired state, creates only a NetworkPolicy and suspended Job, and reports
the Job's Kubernetes-issued identity back to OpenCrane.

Keeping this work in a separate, narrowly privileged process prevents the API server and the runtime
itself from becoming general Kubernetes workload launchers. OpenCrane decides *what* may run; this app
only projects that decision into the one namespace named by its RoleBinding.

```
 OpenCrane internal API ........ durable run attempt + named profile
             │  outbound claim
             ▼
 ┌──────────────────────────────────┐
 │ agent-controller  ◄── HERE        │  one per silo; no listener
 └──────────────┬───────────────────┘
                │ get/create only
                ▼
 attempt NetworkPolicy → suspended agent-runtime Job
                │ Job UID only
                └────────────────────────► OpenCrane assignment authority
```

**In this flow:** [OpenCrane server](../opencrane/README.md) ·
[controller library](../../libs/backend/agents/runtime/controller/README.md) ·
[agent runtime](../agent-runtime/README.md)

Invariant: this app can never make an unassigned runtime executable. Policy creation precedes Job
creation, every existing resource must match exactly, and this slice stops while the Job remains
suspended. A failed assignment commit is retried against the same deterministic Job UID.

## Public surface

`Entrypoint:` `src/index.ts` loads telemetry first, validates configuration, creates the narrow
OpenCrane and Kubernetes adapters, runs the poll loop, and flushes telemetry on `SIGTERM`/`SIGINT`.

## Boundary

The process holds no database credentials and exposes no Service, Ingress, public route or health
listener. Its Kubernetes role grants no Pod, Secret, ServiceAccount, Deployment, patch, replace,
delete, list or watch access. It does not bootstrap or unsuspend Jobs, observe Pods, or dispatch
runtime commands; later Phase E slices add those steps with their own durable fences.

## Dependency direction

Tagged `type:app`, `layer:entrypoint`, and `scope:agent-controller`. The app composes the runtime
controller library and shared observability package; reusable orchestration and adoption rules stay
outside the app root.

## Runtime & config

- `OPENCRANE_INTERNAL_URL` — same-silo internal OpenCrane origin; Helm derives it from the release.
- `OPENCRANE_CONTROLLER_TOKEN_PATH` — rotating `opencrane-agent-controller` audience token file.
- `AGENT_CONTROLLER_KUBERNETES_TOKEN_PATH` — the explicitly projected standard in-cluster token path.
- `AGENT_CONTROLLER_NAMESPACE` — sole namespace the Role and controller may mutate.
- `AGENT_CONTROLLER_POLL_INTERVAL_MS` — 100–60,000 ms delay after idle or failure; default 1,000 ms.
- `AGENT_CONTROLLER_REQUEST_TIMEOUT_MS` — 1–60 second OpenCrane request cap; default 10 seconds.
- `AGENT_CONTROLLER_PROFILES_JSON` — bounded immutable runtime profiles keyed by authority-owned name.

The image runs as an unprivileged numeric user with a read-only root filesystem. Helm provides two
separate projected tokens: one for OpenCrane and one for the Kubernetes API. Structured logs go to
standard output, and OpenTelemetry spans cover every HTTP and Kubernetes input/output call. Enabling
the chart requires immutable SHA-256 digests for both the controller and runtime images.

## See also

- Parent index: [apps](../README.md)
- Controller capability: [runtime/controller](../../libs/backend/agents/runtime/controller/README.md)
- Runtime process: [agent-runtime](../agent-runtime/README.md)
- Manifest builder: [k8s-launcher](../../libs/backend/agents/runtime/k8s-launcher/README.md)
