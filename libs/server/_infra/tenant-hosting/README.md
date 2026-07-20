# @opencrane/server/_infra/tenant-hosting — the hosting-substrate adapter

> [server](../../README.md) › [_infra](../README.md) › tenant-hosting

## What it owns

This library hides **where a tenant's storage physically lives**. A *tenant* is one customer's
isolated running environment; each tenant pod needs a place to keep its state (a "silo"). That place
differs by substrate — a plain Kubernetes volume on-premises, or a cloud bucket in the cloud — and
this library keeps that difference behind one contract so the rest of the server never branches on
the provider.

It defines the `HostingAdapter` contract and the concrete adapters that implement it:

```
 tenant reconciler (the controllers that keep cluster state matching desired config) / hosting factory  (needs storage + a pod state volume)
          │  provisionTenantStorage · buildStateVolume · buildServiceAccountIdentity
          ▼
 ┌────────────────────────────┐
 │  tenant-hosting  ◄── HERE   │   one HostingAdapter contract
 └────────────┬───────────────┘
        ┌──────┴───────┐
        ▼              ▼
 OnPremHostingAdapter   GcpHostingAdapter
 (PVC on the cluster)   (GCS bucket + CSI mount + Workload Identity)
```

**In this flow:** the `feat-openclaw-tenant` operator/reconcilers and the `apps/opencrane` hosting
factory *(select and call an adapter)*

The contract exposes four operations: provision / deprovision external storage, build the pod's
**state volume** and mount, and build the **service-account identity** annotations. On-prem is the
default and a near no-op — tenant state lives on a `PersistentVolumeClaim` (PVC, a request for a
cluster-managed disk). The GCP adapter provisions a per-tenant Google Cloud Storage bucket, mounts it
through a CSI driver (the Kubernetes plug-in that attaches external storage to a pod), and stamps the
ServiceAccount with **Workload Identity** annotations — the mechanism by which a running pod proves
to the cloud which service it is, so it can reach its bucket without a stored key. Invariant: callers
depend only on `HostingAdapter`; adding or swapping a substrate changes an adapter here, never a
call site.

## Public surface

- `HostingAdapter`, `HostingProvider` — the adapter contract and the provider enum.
- `TenantStorageRequest`, `TenantStorageBinding`, `TenantStateVolume`, `GcpHostingConfig` — the I/O types.
- `OnPremHostingAdapter` — the default PVC-backed adapter.
- `GcpHostingAdapter` (+ the GCS bucket client) — the Google Cloud adapter.
- `_BuildPvcStateVolume` — the shared PVC state-volume descriptor.

## Boundary

Consumed by the tenant operator/reconcilers and the server's hosting factory (which picks the adapter
from config). It provisions storage and describes volumes/identity; it does not run reconciliation,
own the tenant lifecycle, or decide policy. It touches cloud/Kubernetes storage APIs only.

## Dependency direction

Tagged `scope:tenant-hosting` (`layer:infra`): it may depend only on `scope:tenant-hosting` and
`scope:shared` packages — never on backend domains, the frontend, or app entrypoints.

## See also

- Parent index: [_infra](../README.md) · [server libraries](../../README.md)
- Siblings: [api](../api/README.md) · [auth](../auth/README.md) · [http](../http/README.md) · [channel-proxy](../channel-proxy/README.md) · [obot-custody](../obot-custody/README.md)
