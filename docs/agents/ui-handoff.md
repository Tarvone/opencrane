# OpenCrane UI Handoff — Structural Rules & Context

## Scope & Purpose
This file provides the canonical structural rules and context for any agent working on the OpenCrane UI session and settings handoff. 
When executing tasks related to the UI handoff, apply these constraints over standard backend-first integration patterns (this is a high-fidelity, **mock-only** delivery).

## Design Language: "Paper" Theme
All implementation must strictly adhere to the updated "Paper" visual theme and overriding design tokens located in `design_handoff/package/README.md`:
- **Paper Background**: `#f5f2ec` (cards `#fff`, borders `#dedad2`).
- **Accents**: Teal (primary/active) `#0db5cc` (hover `#22c7dd`, edge `#0a94a7`), Orange (accents/sparks) `#f47920`, Danger `#c1392b` (borders `#f9c7b4`).
- **Text**: Primary `#1a1918`, Secondary `#6a6660`, Muted `#9a9690`.
- **Typography**: System sans for standard text, 'DM Mono' for code/chips.
- **Buttons (Paper Recipe)**: Buttons must use a specific shadow stack: `box-shadow: 0 1px 0 <edge_color>, 0 2px 3px rgba(...)`. 
  - On hover, buttons animate up (`transform: translateY(-1px)`) and apply a hard-stop 135deg linear gradient (e.g., `#22c7dd 0%, #22c7dd 50%, #0db5cc 50%`). Active state flattens.

**Important Reference**: For all other structural visual specifications—including precise typography scales, spacing geometries, assets, layout grids, and the exact sub-page specifications—you **must refer directly to** `design_handoff/README.md`.

## Mandatory Shared Components
Do not use standard PrimeNG loaders or generic UI when these specific handoff components are required:
1. **`OrigamiLoaderComponent`**: Replaces standard loading spinners in the chat. Implements a 5-facet paper folding animation (`ocFold`).
2. **`CarouselCardComponent`**: Used inside assistant messages to render a horizontally scrollable list of suggested actions/capabilities. Requires the paper button hover lift and gradient.
3. **`CitationStripComponent`**: Must include a "folded paper corner" in the top right that scales in (`scale(1)`) gracefully on hover.

## Settings Navigation & Routing
The workspace settings navigation structure must perfectly match the updated design package. The sections (in order) are:
1. **Pod**
2. **Members**
3. **Budgets**
4. **Skills**: Displays "What your agents know how to do, by scope". Renders capability groups with MCP/Department tags.
5. **Connectors**: Displays "External tools and data sources your agents can call". Replaces the old "Skills" integration list.
6. **Channels**: Must include a list of **Agents** at the top before rendering the traditional "Messaging surfaces" table.
7. **Data & Network**
8. **API Keys**

**Routing Pattern**: Routing should strictly follow the existing routing implementation and patterns currently present in the repository, ignoring any contradictory nested route suggestions from earlier plans.

## Architectural Constraints
- **Mocks & Fixtures**: No backend routes, no CLI commands, no live OIDC. Connect the UI components directly to the existing fixture states defined in `libs/frontend/core/src/lib/data/__test__/` (like `context.data.ts`).
- **Transience**: Secret-shaped provider keys and one-time tokens are transient state. Do not persist them in reusable fixtures, DOM attributes, or local storage.
- **State Handling**: Every form must robustly handle pristine, dirty, invalid, pending, success, conflict, and recoverable error states. Duplicate submissions must be disabled. Destructive actions require explicit dialog confirmation.
