# @opencrane/features/settings

The route-driven settings shell plus workspace and personal settings sections.

## Import

```ts
import { SETTINGS_ROUTES } from "@opencrane/features/settings";
```

## Contents

- `settings.routes` — canonical `/settings/workspace/**` and
  `/settings/personal/**` child routes, redirects, and later-milestone
  placeholders.
- `settings-page` — persistent Paper shell with route-derived navigation and a
  child router outlet.
- `settings-navigation` — feature-owned stable IDs, labels, exact URLs, and
  handoff SVG paths.
- `sections/*` — the surviving pod, awareness, and account pages used until
  their milestone 4/5 replacements land.
- `settings-placeholder` — explicit leaf content for routes whose final page
  is owned by a later milestone.

## Dependencies

`core` (settings models + data) and `elements/ui` (section heading, settings
row, save button, scope chip). Must not import other feature libs.

## Note

Section controls (save, promote, toggles) are mock-only during the UI handoff.
Final section pages replace placeholders without changing their stable routes.
