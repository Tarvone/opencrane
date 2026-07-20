# @opencrane/backend/agents/runtime/controller — suspended attempt reconciliation

> [backend](../../../README.md) › [agents](../../README.md) › [runtime](../README.md) › controller

## What it owns

This package is the narrow reconciliation step between OpenCrane's durable run authority and
Kubernetes execution state. It claims one authorised attempt through OpenCrane, resolves its named
runtime profile, and creates the policy and still-suspended Job for that attempt.

```
 OpenCrane run outbox ........ claims one authorised attempt
              │
              ▼
 ┌───────────────────────────────────┐
 │ runtime/controller  ◄── HERE       │  exact create or exact adoption
 └──────────────┬────────────────────┘
                ▼
 NetworkPolicy → suspended Job → OpenCrane stores Job UID
```

**In this flow:** [runtime Job builder](../k8s-launcher/README.md) ·
[OpenCrane server](../../../../../apps/opencrane/README.md) ·
[agent-controller app](../../../../../apps/agent-controller/README.md)

Invariant: a policy exists before its deterministic Job, an existing object is adopted only when
its complete owned contract matches, and OpenCrane receives only the immutable Job UID returned by
Kubernetes. A crash can leave a harmless suspended Job, never an executing unassigned workload.

## Public surface

- `__RunAgentController` — polls until process shutdown and retries failed claims without repairing
  or replacing Kubernetes objects.
- `__ReconcileNextAgentRuntimeAttempt` — reconciles at most one durable claim and stops after the
  suspended assignment is committed.
- `__ValidateAgentControllerRuntimeProfiles` — validates deployment-supplied profiles through the
  canonical Job builder before polling starts.
- `__CreateHttpAgentControllerAuthority` — claims and commits over the projected-token-authenticated
  internal OpenCrane API.
- `__CreateKubernetesAgentControllerStore` — exposes only get/create for Jobs and NetworkPolicies.

## Boundary

The package does not read Postgres directly, create ServiceAccounts, Pods, Secrets, volumes or
Deployments, watch Kubernetes, replace an existing object, unsuspend a Job, register a Pod, or issue
runtime commands. OpenCrane remains business authority; Kubernetes remains an execution projection.

## Dependency direction

Tagged `scope:agent-runtime-controller` and `layer:infra`; it may depend only on the runtime Job
builder and shared contracts/observability. It never imports an app, OpenCrane-server infrastructure,
Prisma, or the frozen OpenClaw controller.

## Runtime & config

The app supplies one silo namespace, a bounded poll interval, and an immutable profile map. The HTTP
adapter rereads its projected token for every request so kubelet rotation needs no process restart.
The Kubernetes adapter relies on a namespaced Role granting only `get` and `create` for `jobs` and
`networkpolicies`.

## See also

- Parent group: [runtime](../README.md)
- Manifest builder: [k8s-launcher](../k8s-launcher/README.md)
- Process owner: [agent-controller](../../../../../apps/agent-controller/README.md)
