# @opencrane/backend/server/agents/agent-services — publish an agent revision

> [backend](../../../../README.md) › [server](../../../README.md) › [agents](../../README.md) › agent-services

## What it owns

This package is part of the **managed-agent plane** — the side of OpenCrane that turns a saved
agent definition into something the runtime can execute. An *agent service* is the stable identity
of one agent (its name and lifecycle); an *agent revision* is one immutable, versioned snapshot of
how that agent behaves (its prompt policy, model policy, budget, and the skills and integrations it
may use). A service always points at exactly one *active* revision.

This package owns the moment a draft revision becomes the live one. It is one step in the authoring
flow: another part of the system creates the draft, and once published, the runtime executes
whatever revision the service currently points at.

```
 author a draft AgentRevision   (prompt policy · model policy · budget · assigned skills + integrations)
        │
        ▼
 ┌────────────────────────────────────┐
 │  agent-services  ◄── HERE           │  draft owned by this service? immutable + complete?
 │                                     │  is the active pointer still what the caller expected?
 └────────────────────────────────────┘
        │  publish the revision + flip the active pointer  (one compare-and-swap)
        ▼
 runtime executes the service's active revision
```

**In this flow:** [skills](../../skills/main/README.md) · [integrations](../../../gateways/integrations/main/README.md) *(a revision assigns these)*

Invariant: a revision is only published when it belongs to the named service, is still a draft, and
carries every executable field (a positive version, a digest, prompt and model policy, and positive
turn/token/duration budgets). The publish and the pointer flip happen as a single compare-and-swap,
so two people publishing at once cannot both win — the second sees a conflict, and a crash never
leaves a half-published service. Anything missing or stale is refused with a plain reason.

## Public surface

- `__PublishAgentRevision` — the use case: validate a draft, then atomically publish and activate it.
- `PrismaAgentServicePublicationRepository` — the Postgres-backed persistence adapter.
- Types: `AgentServicePublicationRepository` (the persistence boundary the use case needs),
  `PublishAgentRevisionCommand`, `PublishAgentRevisionResult`, `PublishAgentRevisionFailureReason`,
  and the atomic compare-and-swap contract (`AtomicAgentRevisionPublication*`).
- `AgentPublicationAuditEvidencePort` — the seam through which publication records audit evidence.

## Boundary

The application layer composes the use case with the Prisma adapter and calls it. This package does
not author drafts, run agents, or resolve skills/integrations itself — it only flips the active
pointer once a draft is proven publishable. It fails closed: any doubt is a `denied` outcome, never
a silent partial publish.

## Dependency direction

Tagged `scope:agent-services`: it may depend only on `scope:agent-services`, `scope:agents` (shared
agent models), `scope:audit`, `scope:authorization`, and `scope:shared` — never on apps, gateways,
or knowledge domains.

## Data & persistence

Owns the `AgentService`, `AgentRevision`, `AgentRevisionSkillAssignment`, and
`AgentRevisionIntegrationAssignment` models in `apps/opencrane/prisma/schema/agent-services.prisma`.

## See also

- Parent index: [agents](../../README.md)
- Siblings: [skills](../../skills/main/README.md) · [artifacts](../../artifacts/main/README.md) · [channel-targets](../../channel-targets/main/README.md)
