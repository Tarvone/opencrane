# @opencrane/state/settings/adapter — live settings gateway

> [frontend](../../../README.md) › [state](../../README.md) › settings › adapter

## What it owns

Part of the OpenCrane **frontend state layer** (the code between the browser UI and the backend). This
package owns the frontend seam for the operator app's settings sections: the **`SettingsGateway`** port
(a TypeScript interface the settings screens inject, so they never know about HTTP) and the live
**adapter** that fulfils it.

The adapter, `OpenCraneSettingsGateway`, issues typed reads through the shared Control Plane API client
and maps each response onto a small, screen-shaped **read model**. Its main job is translation: the
backend `Tenant` wire shape is broad and generic, so the adapter projects just the fields each section
needs (account profile, pod identity, budget spend, awareness-contract identity, dataset access, egress
domains) rather than exposing the raw contract to the UI.

```
 features/settings (sections)
        │ injects SETTINGS_GATEWAY (the port)
        ▼
 OpenCraneSettingsGateway  ◄── HERE
        │ HTTP: /tenants/{name} · /ai-budget/{name}/spend · /tenants/{name}/effective-contract · /policies
        ▼
 OpenCrane Control Plane API  ──►  Tenant wire shape mapped to read models
```

**In this flow:** [gateways](../../gateways/README.md) · [features/settings](../../../features/settings/README.md)

Invariant: `email` is org-managed and `name` is the immutable pod key, so neither is writable here — a
profile update maps onto a partial `PUT /tenants/{name}` of only the editable fields, then re-reads for
the authoritative result. Error messages are sanitised so server internals never reach the UI.

## Public surface

- `SettingsGateway`, `SETTINGS_GATEWAY` — the settings port + DI token.
- `AccountProfile`, `AccountProfileUpdate`, `PodIdentity`, `BudgetSpend`, `AwarenessContractInfo` — the per-section read models.
- `OpenCraneSettingsGateway` — the live implementation over `/tenants/{name}` (and friends), bound in `state/gateways`.
- `settings-mapper.util` — pure `Tenant` wire → read-model mappers.

## Boundary

Bound to `SETTINGS_GATEWAY` by [`state/gateways`](../../gateways/README.md) and consumed only through
that port by `features/settings`. It maps wire shapes to read models per call; it holds no state and
enforces no authorisation (the control plane does).

## Dependency direction

Tagged `scope:web` (`type:state`): it may depend only on other `scope:web` and `scope:shared`
packages — here `@opencrane/core` and Angular — never on apps or server domains.

## See also

- Parent index: [state](../../README.md)
- Siblings: [tenant/adapter](../../tenant/adapter/README.md) · [mcp/adapter](../../mcp/adapter/README.md) · [gateways](../../gateways/README.md)
