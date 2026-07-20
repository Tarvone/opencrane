# @opencrane/<import-alias> — <four-to-six word essence>

> <area> › <group> › <this package>   ← link each ancestor to its index README

<!--
Fill every placeholder against the package's real source (src/index.ts, project.json,
eslint.config.mjs depConstraint). Delete the optional sections that do not apply, and delete this
comment. Keep the section order. See docs/agents/package-docs.md for the standard and depth profiles.
-->

## What it owns

<1–3 sentences: the single responsibility and the invariant/authority it carries. What breaks if it
is wrong.>

## Public surface

<The load-bearing exports from `src/index.ts`, each with a one-liner. For an app, `Entrypoint: …`.>

## Boundary

<Who consumes it, what it deliberately does not do, and any fail-closed behaviour.>

## Dependency direction

Tagged `scope:<tag>`: it may depend only on <…> — never on apps or sibling domains.

<!-- Optional — include only when it applies: -->
## Data & persistence

<Prisma models/tables owned; migration location.>

## Runtime & config

<Required env/config and defaults. Apps and infra only.>

## Status

<Banner for blue-frozen / deletion-boundary packages. Delete otherwise.>

## See also

- Parent index: [<group>](../README.md)
- Siblings: [<sibling>](../<sibling>/README.md)
