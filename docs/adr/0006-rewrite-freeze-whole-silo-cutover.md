# ADR 0006 — Rewrite freeze with whole-silo blue/green cutover

- **Status:** Accepted
- **Date:** 2026-07-16
- **Task:** `#245` — Phase A decision record
- **Supersedes / superseded by:** selects the rewrite-freeze route over the proposed strangler route
- **Related:** [ADR 0005](0005-opencrane-owned-agent-runtime.md) ·
  [`personal-agent-platform-rewrite-freeze-plan.md`](../design/personal-agent-platform-rewrite-freeze-plan.md) ·
  [`personal-agent-platform-simplification-plan.md`](../design/personal-agent-platform-simplification-plan.md)

## Context

ADR 0005 defines an OpenClaw-free target but does not by itself choose how production reaches it.
The strangler proposal would replace capabilities behind temporary live bridges and projections.
The rewrite-freeze proposal instead stabilizes one immutable blue release, builds the complete green
platform from empty stores without any legacy transfer, and activates one complete ClusterTenant
silo at a time.

The owner selected the rewrite-freeze route on 2026-07-16 to hard-rewire the OpenClaw tenant in one
go, as far as safely possible, and retain direct control over the runtime. This is not authorization
for a fleet-wide big bang: the ClusterTenant remains the atomic isolation and cutover unit.

## Decision

- Stabilize, test, sign, and freeze one immutable OpenClaw-based blue release.
- Keep `main` as the protected blue maintenance line and integrate green through ordinary reviewed
  pull requests on protected `feat/agent-platform-v2`.
- Build green from empty stores with no OpenClaw bridge, transcript mirror, dual-write compatibility
  adapter, legacy-shaped input, or reverse bridge in runtime paths.
- Do not export, import, copy, convert, reconstruct, or otherwise transfer any legacy data, state,
  configuration, identity, identifier, credential, schema, protocol, artifact, or value into green.
  Create every green authority and value anew through green provisioning and onboarding.
- Rehearse clean provisioning, archive isolation, activation, abort, and failure paths; qualify one
  entirely fresh dogfood silo; then activate one complete ClusterTenant at a time.
- Before the commit point, rollback restores the exact signed blue manifest under a new generation.
  After green accepts writes or performs side effects, recovery is forward in green; post-write
  reverse rollback is not supported.

The active-slot/quarantine mechanism is cutover infrastructure only. It is removed after all
ClusterTenants and rollback windows complete.

## R0 clean-build invariant

R0 records the irreversible clean-build boundary: green starts empty, receives nothing from blue,
and uses fresh identities, identifiers, credentials, configuration, stores, and product state.
Blue may remain isolated and read-only for its approved retention window, but green cannot read it
and no archive is a source for green. After green accepts writes or performs side effects, recovery
is forward in green; post-write reverse rollback and a strangler/hybrid escape are not supported.

This is a decision gate, not a documentation formality.

## Alternatives considered

- **Feature-by-feature strangler** — rejected historical design work because it adds temporary live
  compatibility seams to the same domain being replaced. It is not an executable escape route.
- **Fleet-wide big bang** — rejected. One failed activation must not expose every ClusterTenant.
- **Permanent blue/green runtime choice** — rejected. A silo has one active runtime and one writer;
  dual operation exists only as quarantined cutover infrastructure.
- **Reverse bridge by default** — rejected. It recreates a dual-runtime contract and invalidates the
  claimed rewrite-freeze simplicity.

## Consequences

- No green product capability serves a live blue ClusterTenant before its atomic cutover.
- Blue receives only the named stabilization runway and later security/availability-class fixes;
  green applicability is assessed for every exception.
- Clean provisioning, fresh credential custody, archive isolation, side-effect fencing, immutable
  release evidence, and deterministic rehearsal become release-blocking work.
- Product value is delayed until full green qualification, and blue/green capacity must coexist
  during the program.
- R10 replaces `main` only after every silo's retention window, then deletes blue and the
  cutover-only slot machinery.
