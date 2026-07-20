# @opencrane/state/tenant/adapter — live tenant gateway + store

> [frontend](../../../README.md) › [state](../../README.md) › tenant › adapter

## What it owns

Part of the OpenCrane **frontend state layer** (the code between the browser UI and the backend). A
**UserTenant** is a single OpenClaw pod (one user's workspace) living inside a customer's
**ClusterTenant** (their account). This package owns the frontend seam for managing those pods: the
**`UserTenantGateway`** port (a TypeScript interface the admin UI injects, so it never knows about
HTTP), the live **adapter** that fulfils it, and a signal-based **`UserTenantStore`** that holds the
collection for the UI.

The adapter, `OpenCraneUserTenantGateway`, calls `/tenants`, `/tenants/{name}`, and the
`/suspend`/`/resume` actions through the shared Control Plane API client. It absorbs contract quirks so
the UI doesn't have to: the wire `Tenant` has no parent-ClusterTenant field, so `team` is mapped onto
`clusterTenantRef`; the phase string is normalised onto an enum; and because the list endpoint takes no
scope parameter, filtering by ClusterTenant happens client-side.

```
 features/customer-admin (UI)
        │ reads UserTenantStore  ──►  injects USER_TENANT_GATEWAY (the port)
        ▼                                     │
 UserTenantStore (optimistic)  ◄── HERE       ▼
        │                          OpenCraneUserTenantGateway  ◄── HERE
        │                                     │ HTTP: /tenants · /tenants/{name}[/suspend|/resume]
        └── flips row locally, rolls back ────► OpenCrane Control Plane API
```

**In this flow:** [gateways](../../gateways/README.md) · [features/customer-admin](../../../features/customer-admin/README.md)

Invariant: `suspend`/`resume` are **optimistic** — the store flips the local row before the network
call resolves and rolls back to the captured prior state if the call rejects, so the UI stays snappy
without ever showing a state the server refused. Error messages are sanitised before reaching the UI.

## Public surface

- `UserTenantGateway`, `USER_TENANT_GATEWAY` — the tenant port + DI token.
- `UserTenant`, `UserTenantPhase` — the read model + normalised lifecycle enum.
- `UserTenantStore` — the signal store (`tenants`, `count`, `byClusterTenant`, optimistic `suspend`/`resume`, `refresh`).
- `OpenCraneUserTenantGateway` — the live implementation over `/tenants`, bound in `state/gateways`.

## Boundary

Bound to `USER_TENANT_GATEWAY` by [`state/gateways`](../../gateways/README.md); the store and gateway
are consumed by `features/customer-admin` and `apps/opencrane-ui`. Consumers inject the store or the
port, never the concrete client.

## Dependency direction

Tagged `scope:web` (`type:state`): it may depend only on other `scope:web` and `scope:shared`
packages — here `@opencrane/core` and Angular — never on apps or server domains.

## See also

- Parent index: [state](../../README.md)
- Siblings: [settings/adapter](../../settings/adapter/README.md) · [mcp/adapter](../../mcp/adapter/README.md) · [gateways](../../gateways/README.md)
