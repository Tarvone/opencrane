# @opencrane/models/platform-policy — the frozen platform policy and its predicates

> [models](../../README.md) › platform-policy

## What it owns

A **model** package is shared TypeScript types plus pure predicate functions — no database, no
network. This one holds the **platform policy**: the single, frozen set of rules for how the platform
treats state and storage, so every service agrees on the same non-negotiable answers.

The policy is one constant, `___PLATFORM_POLICY`, covering three areas:

- **Durable state** — canonical product data is kept on persistent storage until an authorised
  deletion, backed up, and expanded online before it runs out.
- **Runtime filesystem** — a running agent's root and scratch **workspace** are *non-authoritative*
  (never the source of truth) and are wiped on replacement, scale-to-zero, or lease expiry. "Silo"
  here means one tenant's isolated running environment.
- **Silo update** — an upgrade must finish in under five minutes, remount existing volumes rather
  than transform them, resume the canonical state, and never fall back to a previous runtime.

Alongside the constant it owns predicates (`___Is…Policy`) that check a value satisfies each rule
exactly, plus `___IsSiloUpdateDurationAllowed` (strictly under the five-minute bound) and the
named constants `___MAXIMUM_SILO_UPDATE_DURATION_MS` and `___RUNTIME_WORKSPACE_CLEAR_EVENTS`.

Used as the shared reference by the tenancy and runtime backends and re-exported through
`@opencrane/contracts`. Invariant: the policy is a fixed target — the predicates accept only values
that match it exactly, so a config that drifts from the policy fails the check rather than passing
quietly.

## Public surface

- `___PLATFORM_POLICY` — the frozen policy constant.
- `___MAXIMUM_SILO_UPDATE_DURATION_MS`, `___RUNTIME_WORKSPACE_CLEAR_EVENTS` — named bounds.
- `___IsPlatformPolicy`, `___IsDurableStatePolicy`, `___IsRuntimeFilesystemPolicy`,
  `___IsSiloUpdatePolicy`, `___IsSiloUpdateDurationAllowed` — the predicates.
- Types: `PlatformPolicy`, `DurableStatePolicy`, `RuntimeFilesystemPolicy`, `SiloUpdatePolicy`,
  `RuntimeWorkspaceClearEvent`.

## Boundary

Pure and I/O-free: it states the policy and validates against it. It does not read config, mount
volumes, or run upgrades — the runtime and tenancy backends do that and check themselves here.

## Dependency direction

Tagged `scope:shared` (`layer:model`): a dependency-light contract other packages may import — it
never depends on apps, backend domains, or other model domains.

## See also

- Parent index: [models](../../README.md)
- Siblings: [agents](../../agents/main/README.md) · [artifacts](../../artifacts/main/README.md) · [authorization](../../authorization/main/README.md)
