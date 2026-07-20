# @opencrane/state/core — frontend state-layer hub

> [frontend](../../README.md) › [state](../README.md) › core

## What it owns

This is the hub of the OpenCrane **frontend state layer** — the packages that sit between the
browser UI (the single-page app, or SPA) and the backend HTTP API. The UI never calls HTTP
directly: it calls a **gateway port** instead. A gateway port is just a TypeScript `interface` (plus
an Angular dependency-injection token) that describes *what* data operations exist — `open a thread`,
`list installed tools` — without saying *how* they reach the network. The class that actually makes
the HTTP or WebSocket calls is an **adapter**, and adapters live in the sibling `*/adapter` packages.
This package defines the shared ports and the app-wide identity state everyone else builds on.

It owns three things:

- the **`ConversationGateway`** port and its **`ConnectionStatus`** enum (idle, connecting, open,
  reconnecting, provisioning, refused) — the contract the conversation adapter implements;
- the **`ConversationCache`** port — the contract the IndexedDB cache implements;
- **`SessionStore`**, the signal-based store of who is logged in and what they may do. It reads
  `GET /auth/me` and `GET /tenants` through the typed API clients, and derives coarse
  **`Capabilities`** flags. The **`PLATFORM_SURFACE`** token tells it whether this app build is the
  fleet/platform-operator surface or the customer/org surface, so a role claim only ever unlocks
  controls on its own surface.

```
 core (ports + tokens)      an adapter package        a feature
 ┌──────────────────┐  implements  ┌────────────┐  injects  ┌──────────────┐
 │ ConversationGate │◄────────────│  adapter   │◄─────────│ features/... │
 │ ay · Cache · ◄HERE│             │ (HTTP/WS)  │ port token│ (UI screens) │
 └──────────────────┘             └────────────┘           └──────────────┘
```

**In this flow:** [conversation/adapter](../conversation/adapter/README.md) · [conversation/cache](../conversation/cache/README.md) · [gateways](../gateways/README.md)

Invariant: `Capabilities` are **fail-closed** — an operator/admin power requires an explicit `true`
claim from the server; a missing claim grants nothing rather than elevating the session. These flags
only hide or disable controls in the UI; the API stays the real enforcement point.

## Public surface

- `ConversationGateway`, `ConnectionStatus`, `CONVERSATION_GATEWAY` — the conversation stream port + DI token.
- `ConversationCache`, `CachedThread`, `CachedSessions`, `CONVERSATION_CACHE` — the local-cache port + DI token.
- `SessionStore` — app-wide identity/capability signals (`me`, `user`, `capabilities`, `currentTenant`, `switchTenant`, `logout`).
- `SessionUser`, `SessionTenant`, `Capabilities` — the identity/capability read models.
- `PlatformSurface`, `PLATFORM_SURFACE` — which strictly-separated surface (platform vs org) this build serves.

## Boundary

Consumed by the feature packages (for identity + capability gating), by the adapter packages (which
implement its ports), and by `state/gateways` (which binds those ports). It defines contracts and
holds identity state; it does not itself speak any bespoke wire protocol beyond the typed `/auth` and
`/tenants` reads `SessionStore` needs.

## Dependency direction

Tagged `scope:web` (`type:state`): it may depend only on other `scope:web` and `scope:shared`
packages (here, `@opencrane/core` and Angular) — never on apps, backend, or server domains.

## See also

- Parent index: [state](../README.md)
- Siblings: [gateways](../gateways/README.md) · [conversation/adapter](../conversation/adapter/README.md) · [conversation/cache](../conversation/cache/README.md)
