# @opencrane/server/_infra/api — Kubernetes API plumbing

> [server](../../README.md) › [_infra](../README.md) › api

## What it owns

This is the OpenCrane server's low-level **plumbing for talking to Kubernetes**. Kubernetes is the
cluster platform the server runs on; OpenCrane models its own objects (tenants, access policies,
cluster-tenants) as **custom resources** — CRDs, custom resource definitions, which are user-defined
object types the Kubernetes API server stores and serves like built-in ones. This library is the one
place that knows how to read, write, and watch those objects; it holds no business logic.

It sits directly on the runtime seam between the server's controllers and the Kubernetes API server:

```
 a reconciler / router  (wants to apply or watch a custom resource)
          │
          ▼
 ┌────────────────────────────┐
 │   _infra/api  ◄── HERE      │  CRD constants · apply · watch loop · normalized errors
 └────────────────────────────┘
          │  typed request / event
          ▼
 Kubernetes API server  (stores and serves the custom resources)
```

**In this flow:** the backend tenancy domains (`cluster-tenants`, `tenants`, `projection`) and
`_infra/auth` *(callers)* · the Kubernetes API server *(the substrate)*

It owns: the CRD identity constants (API group `opencrane.io`, version, plural names) so there is one
authority for them; generic `apply` (create-or-update) and a resilient `watch` loop runner that
emits added/modified/deleted events; error normalisation that turns raw client errors into typed,
inspectable ones (for example "not found"); the `ClusterTenant` custom-resource shape; a
namespace builder; and small Linkerd (service-mesh) annotation helpers. Invariant: every custom-
resource access goes through these helpers, so CRD names and error handling stay consistent — a
typo'd group or an unhandled client error can't diverge per call site.

## Public surface

- `OPENCRANE_API_GROUP`, `OPENCRANE_API_VERSION`, `*_CRD_PLURAL` — CRD identity constants.
- `k8s-apply` / `custom-object-apply` — generic create-or-update primitives.
- `watch-runner` (`K8sWatchEventType`, the runner) — the resilient CR watch loop.
- `k8s-errors` / `k8s-api-errors` — normalized, typed Kubernetes client errors.
- `cluster-tenant.types` — the `ClusterTenant` custom-resource shape.
- `cluster-tenant-namespace`, `linkerd` — namespace builder and mesh annotation helpers.

## Boundary

Consumed by the server's reconcilers, routers, and drift detection. It is pure plumbing: it does not
decide *what* to reconcile or enforce policy — it only carries typed requests to the API server and
normalises what comes back. It must not import backend business domains or app entrypoints.

## Dependency direction

Tagged `scope:k8s-api` (`layer:infra`): it may depend only on `scope:k8s-api` and `scope:shared`
packages — never on backend domains, the frontend, or app entrypoints.

## See also

- Parent index: [_infra](../README.md) · [server libraries](../../README.md)
- Siblings: [auth](../auth/README.md) · [http](../http/README.md) · [tenant-hosting](../tenant-hosting/README.md) · [channel-proxy](../channel-proxy/README.md) · [obot-custody](../obot-custody/README.md)
