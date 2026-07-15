# OpenCrane UI Handoff — Structural Rules & Context

## Scope & Purpose
This file provides the canonical structural rules and context for any agent working on the OpenCrane UI session and settings handoff. 
When executing tasks related to the UI handoff, apply these constraints over standard backend-first integration patterns (this is a high-fidelity, **mock-only** delivery).

## Design Source Precedence
The updated design package under `design_handoff/package/` is the authoritative handoff:

1. `design_handoff/package/App.dc.html` is the source of truth for screens, content, layout, navigation, component states, and interactions.
2. `design_handoff/package/MessageList.jsx` is the source of truth for chat messages, citations, the origami loader, and the capability carousel.
3. `design_handoff/package/README.md` defines the current design tokens, package structure, and demo-state guidance.

Use `design_handoff/README.md` only as a fallback for implementation details that the authoritative package does not specify, such as an otherwise-undefined measurement or behavior. A fallback detail is valid only when it is compatible with the package. If the files disagree, the package always wins; the root README must not override the package's colors, typography, content, navigation, component states, interactions, or sub-pages.

The root-level prototypes (`design_handoff/App.dc.html`, `design_handoff/OpenCrane.html`, and `design_handoff/MessageList.jsx`) and `design_handoff/screenshots/` are earlier reference artifacts, not implementation sources of truth.

## Issue-Gated Execution & Delivery
### Execution Gate
Only execute a UI handoff task that references a concrete issue at `https://github.com/Tarvone/opencrane/issues/<number>`. Before changing code, documentation, or assets, read the referenced issue and use its description and acceptance criteria to bound the task. Do not expand the implementation beyond that issue.

If a task has no matching OpenCrane issue reference, points to a different repository, or the issue cannot be inspected, stop before making changes and ask the user for a valid issue URL or the issue contents. Read-only investigation may continue only to help the user identify or clarify the required issue.

### Issue & Design Precedence
The issue defines the task's scope and non-visual acceptance criteria, while the authoritative package defines the design. If an issue specifies styles that conflict with `design_handoff/package/README.md`, this file, or the authoritative package artifacts, the package design takes precedence. Do not use issue-specific colors, typography, spacing, geometry, or component styling to override the package.

Use `design_handoff/README.md` only through the fallback rule above. It cannot override the package or supply a style that the issue explicitly contradicts without first confirming that the style remains compatible with the package. If a non-style issue requirement cannot be reconciled with the authoritative package, pause and ask the user to resolve the ambiguity.

### Commits
Follow the commit rules in `docs/agents/workflow.md`:

- Keep each commit scoped to the referenced issue and stage only the intended files.
- Validate the changed slice. If the policy-driven gate requires independent review, complete it and resolve every Critical or High finding before ending the work cycle.
- Start the subject with the repository's intent-appropriate emoji, use imperative mood, and keep it under 72 characters.
- Reference the issue in the subject, for example `🎨 implement session handoff (#123)`. If that makes the subject too long, put `Refs #123` in the commit body.
- Do not add an AI or Claude co-author trailer.

End each work cycle with a suggested commit message even when the user has not asked the agent to create the commit.

### Pull Requests
When the user asks for a pull request, create it from the issue-scoped branch and include:

- A concise, issue-scoped title.
- A summary of the implemented acceptance criteria.
- The validation and review evidence.
- `Closes #<number>` on its own line in the PR body so merging the PR closes the referenced issue.

Use a closing keyword only when the pull request fully satisfies the issue. A partial or draft pull request must use `Refs #<number>` instead, identify the remaining work, and must not claim to close the issue.

## Design Language: "Paper" Theme
All implementation must strictly adhere to the updated "Paper" visual theme and overriding design tokens located in `design_handoff/package/README.md`:
- **Paper Background**: `#f5f2ec` (cards `#fff`, borders `#dedad2`).
- **Accents**: Teal (primary/active) `#0db5cc` (hover `#22c7dd`, edge `#0a94a7`), Orange (accents/sparks) `#f47920`, Danger `#c1392b` (borders `#f9c7b4`).
- **Text**: Primary `#1a1918`, Secondary `#6a6660`, Muted `#9a9690`.
- **Typography**: System sans for standard text, 'DM Mono' for code/chips.
- **Buttons (Paper Recipe)**: Buttons must use a specific shadow stack: `box-shadow: 0 1px 0 <edge_color>, 0 2px 3px rgba(...)`. 
  - On hover, buttons animate up (`transform: translateY(-1px)`) and apply a hard-stop 135deg linear gradient (e.g., `#22c7dd 0%, #22c7dd 50%, #0db5cc 50%`). Active state flattens.

**Fallback Reference**: For a structural or visual detail not defined by the authoritative package or this file, consult `design_handoff/README.md` and use the detail only when it does not conflict with the package.

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
