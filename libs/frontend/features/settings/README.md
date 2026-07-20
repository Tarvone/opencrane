# @opencrane/features/settings — the settings page

> [frontend](../../README.md) › [features](../README.md) › settings

## What it owns

This is a frontend **feature** package: it owns the settings page — a left-hand section nav and one
active section at a time (chosen by a `@switch` over a `SettingsSection` enum). The sections cover
pod, model budget, awareness, skills, channels, access, network, and account.

The page is mounted by the workspace shell at the `/settings` child route, so it is deep-linkable.
It reads settings models from `core` and the settings **store** (a client-side state holder — a
singleton that keeps the browser app's copy of settings and exposes it as signals). Talking to the API goes
through the settings **gateway** (an injection token that is the port to the opencrane-server HTTP
surface), which the app binds to either a live or a mock implementation.

## Public surface

- `SettingsPageComponent` — the page: section nav plus the active section, composing the shared
  settings-form primitives.

## Boundary

Consumed by `features/workspace`, which mounts it as a child route. It must not import other feature
packages; shared visuals come from `elements/ui`. It presents settings and raises save/toggle
intents — the server remains the authority on what actually changes.

## Dependency direction

Tagged `scope:web` (the frontend dependency tier): it may import only other `scope:web` packages
and `scope:shared` contracts. It depends on `@opencrane/core`, `@opencrane/state/settings/adapter`
(the settings store), `@opencrane/state/gateways` (dependency-injection composition), and
`@opencrane/elements/ui` (section heading, settings row, save button, scope chip).

## See also

- Parent index: [features](../README.md)
- Consumer: [features/workspace](../workspace/README.md)
- Store: [state/settings/adapter](../../state/settings/adapter/README.md)
