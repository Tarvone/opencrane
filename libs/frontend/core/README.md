# @opencrane/core — frontend domain foundation

> [frontend](../README.md) › core

## What it owns

This is the frontend **core** package: the base layer every other frontend package sits on. It
holds the cross-cutting primitives the SPA (the single-page app, `apps/opencrane-ui`) shares — the
domain models, the typed API client, the theme, and pure utilities — so no feature has to redefine
them or hand-roll HTTP.

It is the bottom of the frontend dependency graph: it depends on no other `@opencrane` frontend
package, and everything else may depend on it. Its most load-bearing job is being the **one door to
the server**: all HTTP goes through the API services here, typed against the generated contract, so
a feature never calls `fetch` directly and never guesses a request or response shape.

```
 features · elements · state  ──import──►  core  ──types against──►  @opencrane/contracts
                                            │
                                            └─ ControlPlaneApiService  ──HTTP──►  opencrane-server
```

**In this flow:** `@opencrane/contracts` *(the generated typed client shared with the backend)*

## Public surface

- `lib/models/*.types.ts` — shared DTOs, enums, and colour/label maps (`scope`, `session`, `thread`,
  `context`, `notification`, `settings`, `mcp`, `plan`).
- `lib/data/*.data.ts` — demo fixtures, temporary until the live API replaces them.
- `ControlPlaneApiService` + `FleetManagerApiService` — the typed HTTP clients, plus their
  `CONTROL_PLANE_BASE_URL` / `FLEET_MANAGER_BASE_URL` injection tokens.
- `WeOwnAiPreset` (`lib/theme/weownai-preset`) — the PrimeNG theme preset.
- `lib/utils/*` — framework-agnostic helpers (`_ToggleId`, collection helpers).

## Boundary

Consumed by every other frontend package. The Control Plane client types against
`@opencrane/contracts` (generated intra-repo from the backend's OpenAPI spec, so the same source of
truth as the server); the Fleet Manager client types against a pinned external spec. It must never
import backend application source — the network contract is the only coupling.

## Dependency direction

Tagged `scope:web` (the frontend dependency tier): it may import only other `scope:web` packages
and `scope:shared` contracts. It imports no other frontend package; its one dependency is the
`scope:shared` `@opencrane/contracts`.

## See also

- Parent index: [frontend](../README.md)
- Platform seam: [platform](../platform/README.md)
- Shared visuals: [elements/ui](../elements/ui/README.md)
