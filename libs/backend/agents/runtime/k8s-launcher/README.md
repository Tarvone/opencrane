# @opencrane/backend/agents/runtime/k8s-launcher — runtime Job resources

> [backend](../../../README.md) › [agents](../../README.md) › [runtime](../README.md) › k8s-launcher

## What it owns

This infrastructure package translates one already-authorised agent run attempt into its exact
Kubernetes resource set. It builds a deny-ingress and bounded-egress NetworkPolicy and a suspended
single-Pod Job using a controller-selected ServiceAccount from the bounded runtime-profile pool.

```
 authorised run attempt + immutable runtime profile
                 │
                 ▼
 ┌─────────────────────────────────────┐
 │  runtime/k8s-launcher  ◄── HERE      │  pure manifest construction
 └──────────────────┬──────────────────┘
                    ▼
 suspended Job + NetworkPolicy
                    │  next slice: controller persists Job UID, then unsuspends
                    ▼
 agent-runtime process
```

**In this flow:** [runtime authority](../main/README.md) ·
[agent-runtime process](../../../../../apps/agent-runtime/README.md)

Invariant: the returned Job is always suspended, has one completion and no retry, and cannot receive
provider credentials or durable storage. Invalid authority coordinates or an unpinned, cross-namespace,
or externally routed profile fail before any Kubernetes adapter can perform input/output (I/O). The
default ServiceAccount token is disabled; the only workload credential is a short-lived token for the
`opencrane-agent-runtime` audience, mounted read-only for the non-root runtime group.

## Public surface

- `__BuildSuspendedAgentRuntimeJobResources(assignment, profile)` — builds the Job and NetworkPolicy
  for one run attempt.
- `AgentRuntimeJobAssignment` — the durable run, attempt, revision, silo, and namespace coordinates.
- `AgentRuntimeJobProfile` — the bounded ServiceAccount, release selectors, immutable image, internal
  route, deadlines, resources, and scratch limits fixed by the controller profile.
- `AgentRuntimeJobResources` — the two Kubernetes manifests returned to the controller adapter.

## Boundary

The builder is pure. It does not call Kubernetes, read Prisma, own run state, provision
ServiceAccounts, grant role-based access control (RBAC), or decide whether an attempt may execute.
The next `apps/agent-controller` slice will be the only process allowed to create these resources,
read the Job UID, persist the matching assignment/bootstrap, and then unsuspend the Job. This package
defines that contract but has no production caller in this slice.

## Dependency direction

Tagged `scope:agent-runtime-launcher` and `layer:infra`; it may depend only on its own scope and shared
contracts. It never imports an application entrypoint or an OpenCrane-server infrastructure package.

## Runtime & config

There are no environment variables or I/O. The caller supplies a digest-pinned image, same-namespace
runtime-stream URL, bounded zero-RBAC ServiceAccount, exact release and server selectors, a 600–3600
second token lifetime, finite deadline, at most 1 GiB scratch, and explicit CPU/memory resources. The
rendered Pod runs as UID/GID 65532 with `fsGroup: 65532`; projected token mode `0440` therefore remains
readable without making it world-readable.

## See also

- Parent group: [runtime](../README.md)
- Runtime authority: [main](../main/README.md)
- Server transport: [agent-runtime-stream](../../../../server/_infra/agent-runtime-stream/README.md)
- Process owner: [agent-runtime](../../../../../apps/agent-runtime/README.md)
