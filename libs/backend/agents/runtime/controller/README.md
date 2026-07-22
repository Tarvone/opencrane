# @opencrane/backend/agents/runtime/controller — attempt workload reconciliation

> [backend](../../../README.md) › [agents](../../README.md) › [runtime](../README.md) › controller

## What it owns

This package is the narrow reconciliation step between OpenCrane's durable run authority and
Kubernetes execution state. It first claims an authorised attempt, resolves its named runtime
profile, and creates the still-suspended Job in a dedicated runtime namespace. A second durable reconciliation releases
only the exact assigned Job and registers its unique first Pod.

The split exists because a database transaction and a Kubernetes create cannot commit together. The
controller therefore orders the two authorities so every recoverable partial state is harmless: a
crash may leave an exact suspended Job to adopt later, but never an executing Job whose UID was not
accepted by OpenCrane.

```
 OpenCrane run outbox ........ claims one authorised attempt
              │
              ▼
 ┌───────────────────────────────────┐
 │ runtime/controller  ◄── HERE       │  exact create or exact adoption
 └──────────────┬────────────────────┘
                ▼
 runtime namespace policy already present
                │
                ▼
 suspended Job → OpenCrane stores Job UID
                                  │ durable release claim
                                  ▼
                         conditional unsuspend → first Pod UID
```

**In this flow:** [runtime Job builder](../k8s-launcher/README.md) ·
[OpenCrane server](../../../../../apps/opencrane/README.md) ·
[agent-controller app](../../../../../apps/agent-controller/README.md)

Invariant: deployment owns one fail-closed policy for the dedicated runtime namespace, while this
controller creates only deterministic Jobs. An existing Job is adopted only when its complete owned
contract matches. Release converts the durable assignment's absolute expiry into a conservative
whole-second deadline, then tests Job UID, resource version, `suspend=true`, and the profile deadline
before lowering that deadline and unsuspending in one patch. The bound reserves both the database
release-lease horizon and a complete Kubernetes patch timeout. A crash after release is recoverable:
the exact unsuspended Job is adopted only when its Kubernetes start time plus deadline proves it
ends by the durable expiry; zero Pods means retry while multiple or foreign Pods fail closed.

## Public surface

- `__RunAgentController` — polls until process shutdown and retries failed claims without repairing
  or replacing Kubernetes objects.
- `__ReconcileNextAgentRuntimeAttempt` — reconciles at most one durable claim and stops after the
  suspended assignment is committed.
- `__ReconcileNextRuntimeRelease` — conditionally unsuspends one exact assigned Job and registers
  only its unique, strictly owned first Pod.
- `__ValidateAgentControllerRuntimeProfiles` — validates deployment-supplied profiles through the
  canonical Job builder before polling starts.
- `__CreateHttpAgentControllerAuthority` — claims and commits over the projected-token-authenticated
  internal OpenCrane API.
- `__CreateKubernetesAgentControllerStore` — exposes exact Job adoption, expiry-bounded fenced Job release,
  and selector-bounded first-Pod listing.

## Boundary

The package does not read Postgres directly, create ServiceAccounts, Pods, Secrets, volumes or
Deployments, watch Kubernetes, replace an object, mutate a Pod, or issue runtime commands. It can
only lower `spec.activeDeadlineSeconds` and patch `spec.suspend` from true to false together after all identity tests pass. OpenCrane remains business
authority; Kubernetes remains an execution projection.

## Dependency direction

Tagged `scope:agent-runtime-controller` and `layer:infra`; it may depend only on the runtime Job
builder and shared contracts/observability. It never imports an app, OpenCrane-server infrastructure,
Prisma, or the frozen OpenClaw controller.

## Runtime & config

The app supplies one runtime namespace, a bounded poll interval, and an immutable profile map whose
server namespace must be valid and different. The HTTP
adapter rereads its projected token for every request so kubelet rotation needs no process restart.
The Kubernetes adapter relies on a Role in the runtime namespace granting `get/create/patch` for
Jobs and `list` for Pods. It has no Kubernetes Networking client. It lists Pods with both the Job-controller UID
and deterministic attempt label; it has no Pod `get`, mutation, delete, or watch privilege. Every
release reconciliation opens one parent trace around its claim, Kubernetes changes, Pod discovery,
registration and outcome log; the opaque bootstrap reference is never a trace attribute. Every
Kubernetes create, read, patch, and list has its own hard deadline. The patch timeout is subtracted
from remaining assignment authority before release, so delayed transport cannot extend execution.
Shutdown aborts an in-flight
request through the Kubernetes client itself, while a later retry receives a new deadline.

## See also

- Parent group: [runtime](../README.md)
- Manifest builder: [k8s-launcher](../k8s-launcher/README.md)
- Process owner: [agent-controller](../../../../../apps/agent-controller/README.md)
