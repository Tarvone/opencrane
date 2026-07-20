# @opencrane/features/workspace — the workspace shell

> [frontend](../../README.md) › [features](../README.md) › workspace

## What it owns

This is the frontend **feature** package for the application shell — the route-level container that
composes every other feature into the three-pane console and hosts the child routes. It owns the
persistent frame (sidebar rail plus popovers) and a `<router-outlet>` into which the session,
settings, and tools views render, so every view is deep-linkable and browser back/forward switches
between them.

```
 ┌── workspace shell  ◄── HERE ─────────────────────────────┐
 │ sidebar rail   │  centre: conversation │ right: context   │
 │ (sessions,     │  ─────────────────────┴───────────────── │
 │  runs)         │  child routes: session · settings · tools │
 │  bell popover: notifications                              │
 └───────────────────────────────────────────────────────────┘
```

**In this flow:** [features/conversation](../conversation/README.md) ·
[features/context](../context/README.md) · [features/notifications](../notifications/README.md) ·
[features/settings](../settings/README.md) · [features/tools](../tools/README.md)

The root of the workspace opens a blank "new session" composer; sending the first message mints a
session id and deep-links to `session/:id`. In-process A2UI canvas rendering is provided here (on
the lazy route) so its vendored code stays out of the initial bundle.

## Public surface

- `WORKSPACE_ROUTES` — the lazy route table the host app mounts at the root path.
- `WorkspacePageComponent` — the shell (sidebar, view switch, notification popover).
- `SessionPageComponent` — the session view (new-session and `session/:id`).
- `TenantSwitcherComponent` — switches the active tenant from the sidebar.

## Boundary

Mounted by `apps/opencrane-ui` behind its access and first-run guards. This is the **only** feature
package allowed to import sibling features — it orchestrates; the display lives in the packages it
composes. Keep it thin.

## Dependency direction

Tagged `scope:web` (the frontend dependency tier): it may import only other `scope:web` packages
and `scope:shared` contracts. It depends on `@opencrane/core`, `@opencrane/state/core`,
`@opencrane/elements/{ui,a2ui}`, and `features/{conversation,context,notifications,settings,tools}`.

## See also

- Parent index: [features](../README.md)
- Composed features: [conversation](../conversation/README.md) · [settings](../settings/README.md) · [tools](../tools/README.md)
- Host app: `apps/opencrane-ui`
