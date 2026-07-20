# @opencrane/features/customer-admin — the customer-admin console

> [frontend](../../README.md) › [features](../README.md) › customer-admin

## What it owns

This is a frontend **feature** package (a lazy-loaded route plus its components — the browser only
downloads its code when the route is first opened). It owns the customer-admin console: the
`/customer-admin` screen where a customer's own admin manages the **UserTenants** inside their
**ClusterTenant**. A ClusterTenant is one customer's isolated slice of the platform; a UserTenant is
one person's agent workspace (an OpenClaw pod) within it. The console lists those UserTenants and
offers suspend/resume actions.

This is an account-scoped view, not a platform-wide operator view: the listing is scoped to the
admin's own ClusterTenant. Access is gated in the component on the session's `customerAdmin`
capability, which only hides controls — the server API remains the real enforcement point.

## Public surface

- `CUSTOMER_ADMIN_ROUTES` — the lazy route table the app mounts under `/customer-admin`.
- `CustomerAdminPageComponent` — the console: a table of UserTenants with row actions.
- `UserTenantPhaseBadgeComponent` — a status badge mapping a UserTenant's phase to a colour.
- `customer-admin.types` / `customer-admin.util` — the row view-model and its pure builder.

## Boundary

Mounted by `apps/opencrane-ui`. It reads the UserTenant **store** (a client-side state holder — a
singleton that keeps the browser app's copy of the tenant list and exposes it as signals) and the session
store; suspend/resume go through the store's optimistic mutators (they update the UI first, then reconcile with the server). It does not enforce access itself.

## Dependency direction

Tagged `scope:web` (the frontend dependency tier): it may import only other `scope:web` packages
and `scope:shared` contracts. It depends on `@opencrane/state/tenant/adapter` (the UserTenant store)
and `@opencrane/state/core` (the session store).

## See also

- Parent index: [features](../README.md)
- Tenant store: [state/tenant/adapter](../../state/tenant/adapter/README.md)
- Host app: `apps/opencrane-ui`
