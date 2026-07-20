# Package documentation standard

> Part of the OpenCrane agent guidance. See [`AGENTS.md`](../../AGENTS.md) for the index.

Every package and every directory tier carries a `README.md`, and they form one navigable tree: the
root front door → area/group index maps → leaf package READMEs. A reader (or agent) can start
anywhere and walk **up** to context or **down** to detail without hitting a dead end. This file is
the contract for that tree. Read it before writing or editing any `README.md` under `libs/**` or
`apps/**`.

The house voice applies throughout: UK English, sentence-case headings, active voice, no marketing,
no "simply", no emoji. State the constraint the code cannot show — not a line-by-line narration of
what the code already says.

## The three tiers

1. **Root [`README.md`](../../README.md)** — the project front door (what OpenCrane is, the vision,
   the top-level map). Owned by the `readme` agent; deep mechanism stays out of it.
2. **Area / group index READMEs** — one per grouping directory (`libs/frontend/`,
   `libs/backend/server/`, each `<group>/`, `libs/models/`, `apps/_infra/`, …). Each is a **map**,
   not prose: a breadcrumb, a one-row-per-child table, and the dependency rule for that tier.
3. **Leaf package READMEs** — one per package (the directory holding `project.json`; for domain libs
   that is the `main/` directory). The bulk of this standard governs these.

Every tier-2 and tier-3 file **opens with a breadcrumb** and **closes with a See-also**. That
up/down linking is what makes the repo navigable — treat it as mandatory, not decorative.

- Breadcrumb (first line after the H1): `> backend › server › iam` with each ancestor linked to its
  index README, the current node in plain text.
- See-also (last section): link the parent index and the closest siblings.

## Leaf package README — fixed section order

Use these headings, in this order, in every leaf README. Omit an optional section only when it does
not apply; never reorder.

1. **Title** — `# @opencrane/<import-alias>` followed by a one-line essence. Find the alias in
   `tsconfig.json` paths / `project.json` name. If a package has no alias, title it by its
   `project.json` name and say so.
2. **Breadcrumb** — see above.
3. **What it owns** — 1–3 sentences: the single responsibility and the invariant or authority it
   carries. Answer *why it exists and what breaks if it is wrong*.
4. **Public surface** — the load-bearing exports from `src/index.ts`, each with a one-liner (or
   `Entrypoint: …` for apps). Answer *what a caller imports*. Ground every name in the actual barrel.
5. **Boundary / contract** — who consumes it, what it deliberately does **not** do, and any
   fail-closed behaviour. Answer *how to use it correctly and where it stops*.
6. **Dependency direction** — the `project.json` scope tag and what it may / may-not import, taken
   from the matching `depConstraint` in `eslint.config.mjs`. One or two sentences.
7. *(optional)* **Data & persistence** — Prisma models/tables owned, migration location. Include for
   any package with a Prisma adapter.
8. *(optional)* **Runtime & config** — required env/config and defaults. Include for apps and infra.
9. *(optional)* **Status** — a banner for blue-frozen / deletion-boundary packages, stated first.
10. **See also** — parent index + siblings.

**Bare minimum** (even the smallest stub): the titled purpose line (1), the public entrypoint (4),
and a dependency/boundary one-liner with breadcrumb + See-also (2, 5–6, 10). Everything else scales
up by type below.

## Depth profiles by package type

Right-size the README to the package — do not pad a pure type package to look like an authority.

| Type | Where | Emphasise | Rough size |
|------|-------|-----------|-----------|
| Backend domain authority | `libs/backend/server/*`, `libs/backend/agents/personal/*`, `libs/backend/artifacts/*` | the invariant it enforces, its persistence boundary, fail-closed reasons | 20–35 lines |
| Pure model / util | `libs/models/*`, `libs/util`, `libs/observability` | "pure, no I/O", the types/helpers it defines, who depends on it | 8–15 lines |
| Frontend feature | `libs/frontend/features/*` | the route/UI slice it owns, its store dependencies, `scope:web` rule, consumer app | 10–18 lines |
| Frontend element | `libs/frontend/elements/*` | the presentational components it exposes, design-system tie-in | 8–15 lines |
| Frontend state (port/adapter) | `libs/frontend/state/*` | the gateway port it defines/implements, the HTTP surface it adapts, write-only invariants, consumer | 10–15 lines |
| Frontend core/platform | `libs/frontend/{core,platform}` | the cross-cutting primitives it holds, FORK-shared status | 15–25 lines |
| Deployable app | `apps/opencrane`, `apps/channel-proxy`, `apps/artifact-service`, `apps/opencrane-ui` | what it composes, trust/runtime posture, entrypoint, deploy unit | 20–40 lines |
| Vendored infra app | `apps/_infra/{cognee,litellm,obot,langfuse}`, `apps/postgres` | upstream link, **why we run it**, pinned image/version, the config knobs, what OpenCrane owns vs the vendor | 15–25 lines |
| Server infra lib | `libs/server/_infra/*` | the runtime seam it owns, its sole consumer, what it must not import | 12–20 lines |
| Group / area index | grouping dirs | the child map table + the tier dependency rule | 15–30 lines |

## Template

Copy [`README-TEMPLATE.md`](./README-TEMPLATE.md) into a new package and fill every placeholder.
Delete optional sections that do not apply.

## Maintenance — this is part of the agent loop

Package docs drift the moment a contract changes, so upkeep is a definition-of-done item, not a
separate chore. Whenever you (a Claude Code lane or a Codex agent) change a package:

- **Change a package's exports, boundary, invariant, owned Prisma models, or config** → update that
  package's `README.md` in the **same** change. A diff that alters the public surface without
  touching the README is incomplete.
- **Add a package** → create its `README.md` from the template and add a row to the parent index.
- **Move or rename a package** → move its README, fix the breadcrumb/See-also, and update every
  index that lists it (and the central map in [`app-specific.md`](./app-specific.md)).
- **Delete a package** → the `reaper` gate removes its README and its index/​map rows with it.

The review gate ([`workflow.md`](./workflow.md)) treats a contract change with a stale or missing
README as a finding. The `architecture` gate checks that a newly added package ships a README; the
`reaper` gate checks that a removed one takes its docs with it.
