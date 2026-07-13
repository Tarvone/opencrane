# @opencrane/core

Domain foundation for WeOwnAI: models, demo data, the typed OpenCrane API
client, the PrimeNG theme preset, and pure utilities.

## Import

```ts
import { ScopeLevel, ControlPlaneApiService, WeOwnAiPreset, _ToggleId } from "@opencrane/core";
```

## Contents

- `lib/models/*.types.ts` — DTOs, enums, and colour/label maps (`scope`,
  `session`, `thread`, `context`, `notification`, `settings`).
- `lib/data/*.data.ts` — demo fixtures. **Temporary**; to be replaced by live
  `core/api` calls.
- `lib/api/` — `ControlPlaneApiService` + `FleetManagerApiService` (typed
  `openapi-fetch` clients) and the `CONTROL_PLANE_BASE_URL` / `FLEET_MANAGER_BASE_URL`
  tokens. `api/generated/{control-plane,fleet-manager}.ts` are generated from the
  two pinned specs and gitignored — run `pnpm generate:api`.
- `lib/theme/weownai-preset.ts` — `definePreset(Aura, …)`; terracotta ToggleSwitch.
- `lib/utils/` — framework-agnostic helpers (e.g. `_ToggleId`).

## Dependencies

Depends on **no other `@opencrane` lib** (it is the base). All HTTP must go through
`api/` services — never call `fetch` from features or components.

## Boundary

The only coupling to OpenCrane is the pinned OpenAPI spec → generated client.
Never import OpenCrane source code here.
