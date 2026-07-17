# OpenCrane UI Design — Structural Rules & Context

## Scope & Purpose
This file provides the canonical structural rules and context for any agent working on the OpenCrane UI session and settings handoff. 
When executing tasks related to the UI handoff, apply these constraints over standard backend-first integration patterns (this is a high-fidelity, **mock-only** delivery).

## Design Source Precedence
The design bundle under `ui_designs/` is the authoritative handoff. All files live directly in `ui_designs/project/`:

1. `ui_designs/project/App.dc.html` — source of truth for the full app shell: screens, content, layout, navigation, component states, and interactions.
2. `ui_designs/project/MessageList.jsx` — source of truth for chat messages, citations, the origami loader, and the capability carousel.
3. `ui_designs/project/SettingsNav.dc.html` — source of truth for the settings sidebar navigation structure and active states.
4. `ui_designs/project/Sidebar.dc.html` — source of truth for the workspace sidebar (rail, session list, brand, user row).
5. `ui_designs/project/Composer.dc.html` — source of truth for the message composer component.
6. `ui_designs/project/Onboarding Simulation.dc.html` — source of truth for the onboarding / welcome flow.
7. `ui_designs/project/Agent Creation Simulation.dc.html` — source of truth for the agent-creation flow.
8. `ui_designs/project/Group Discussion Simulation.dc.html` — source of truth for group / multi-agent discussion threads.
9. `ui_designs/project/Skill Simulation.dc.html` — source of truth for skill-invocation and tool-call presentation.

Use `ui_designs/README.md` only as a fallback for implementation details that the authoritative project files do not specify, such as an otherwise-undefined measurement or behaviour. A fallback detail is valid only when it is compatible with the project files. If the files disagree, the most specific project file wins; `ui_designs/README.md` must not override any project file's colours, typography, content, navigation, component states, interactions, or sub-pages.

## Issue-Gated Execution & Delivery
### Execution Gate
Only execute a UI handoff task that references a concrete issue at `https://github.com/Tarvone/opencrane/issues/<number>`. Before changing code, documentation, or assets, read the referenced issue and use its description and acceptance criteria to bound the task. Do not expand the implementation beyond that issue.

If a task has no matching OpenCrane issue reference, points to a different repository, or the issue cannot be inspected, stop before making changes and ask the user for a valid issue URL or the issue contents. Read-only investigation may continue only to help the user identify or clarify the required issue.

### Issue & Design Precedence
The issue defines the task's scope and non-visual acceptance criteria, while the authoritative project files define the design. If an issue specifies styles that conflict with any file under `ui_designs/project/`, this file, or the authoritative project artefacts, the project design takes precedence. Do not use issue-specific colors, typography, spacing, geometry, or component styling to override the project files.

Use `ui_designs/README.md` only through the fallback rule above. It cannot override the project files or supply a style that the issue explicitly contradicts without first confirming that the style remains compatible with the project. If a non-style issue requirement cannot be reconciled with the authoritative project files, pause and ask the user to resolve the ambiguity.

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
All implementation must strictly adhere to the updated "Paper" visual theme and overriding design tokens. Token values must be read from `apps/opencrane-ui/src/styles.scss` (the `:root` block); the values listed below are a quick-reference summary only:
- **Tokens First**: All components must use bare CSS variables (e.g., `var(--oc-teal)`) for colors that already have defined tokens. Do not hardcode hex values or use `var(--token, #hex)` fallbacks when a corresponding token exists in the theme.
- **Paper Background**: `#f5f2ec` (cards `#fff`, borders `#dedad2`).
- **Accents**: Teal (primary/active) `#0db5cc` (hover `#22c7dd`, edge `#0a94a7`), Orange (accents/sparks) `#f47920`, Danger `#c1392b` (borders `#f9c7b4`).
- **Text**: Primary `#1a1918`, Secondary `#6a6660`, Muted `#9a9690`.
- **Typography**: 'DM Sans' (`--font-sans`) for standard text, 'DM Mono' (`--font-mono`) for code/chips. Both fonts are bundled locally under `public/fonts/` — do not use a CDN fallback.
- **Buttons (Paper Recipe)**: Buttons must use a specific shadow stack: `box-shadow: 0 1px 0 <edge_color>, 0 2px 3px rgba(...)`. 
  - On hover, buttons animate up (`transform: translateY(-1px)`) and apply a hard-stop 135deg linear gradient (e.g., `#22c7dd 0%, #22c7dd 50%, #0db5cc 50%`). Active state flattens.

**Fallback Reference**: For a structural or visual detail not defined by any file under `ui_designs/project/` or this guide, consult `ui_designs/README.md` and use the detail only when it does not conflict with the project files.

## Mandatory Shared Components
Do not use standard PrimeNG loaders or generic UI when these specific handoff components are required:
1. **`OrigamiLoaderComponent`**: Replaces standard loading spinners in the chat. Implements a 5-facet paper folding animation (`ocFold`).
2. **`CarouselCardComponent`**: Used inside assistant messages to render a horizontally scrollable list of suggested actions/capabilities. Requires the paper button hover lift and gradient.
3. **`CitationStripComponent`**: Must include a "folded paper corner" in the top right that scales in (`scale(1)`) gracefully on hover.

## Settings Navigation & Routing
The authoritative source is `ui_designs/project/SettingsNav.dc.html`. The nav has two tabs — **Workspace** and **Personal** — each with its own ordered section list.

**Workspace tab** (in order):
1. **Pod**
2. **Members**
3. **Budgets**
4. **Skills** — displays agent capabilities by scope; renders capability groups with MCP/Department tags.
5. **Connectors** — external tools and data sources agents can call.
6. **Agents** — agent-level configuration.
7. **Data & Network**
8. **LLM Providers** — replaces the old "API Keys" label.

**Personal tab** (in order):
1. **Account**
2. **Awareness**
3. **My Budget**
4. **API Keys**

**Routing Pattern**: The settings feature uses nested routing mounted at `/settings` by the workspace shell. The `SettingsPageComponent` is the parent route component; the two scope tabs map to child path segments `workspace/` and `personal/`, each with their own lazy-loaded section children (e.g. `/settings/workspace/pod`, `/settings/personal/account`). New sections must follow this existing nested structure — do not flatten to a single level or introduce a parallel routing strategy.

## Architectural Constraints
- **Mocks & Fixtures**: No backend routes, no CLI commands, no live OIDC. Connect the UI components directly to the existing fixture states defined in `libs/frontend/core/src/lib/data/__test__/` (like `context.data.ts`).
- **Transience**: Secret-shaped provider keys and one-time tokens are transient state. Do not persist them in reusable fixtures, DOM attributes, or local storage.
- **State Handling**: Every form must robustly handle pristine, dirty, invalid, pending, success, conflict, and recoverable error states. Duplicate submissions must be disabled. Destructive actions require explicit dialog confirmation.
