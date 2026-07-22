# @opencrane/backend/server/agents/scheduling — managed-agent schedule semantics

> [backend](../../../../README.md) › [server](../../../README.md) › [agents](../../README.md) › scheduling

## What it owns

This package is the **scheduler brain** for managed (central) agents. A managed agent can carry a
recurring *schedule* — a cron expression evaluated in a timezone. This package turns that schedule
plus the current time into the exact set of runs that are due, and admits each one. It does not run
anything itself: it only decides *when* a run should exist and records that run through the existing
admission seam.

It is composed INSIDE the control API process (`apps/opencrane`), not a separate worker — a schedule
tick uses the same identity and privilege as the rest of the control plane. Catch-up is handled by a
bounded lookback window rather than leader election: a tick that runs late simply sees every missed
slot inside the window and admits them oldest-first.

```
 AgentServiceSchedule (cron · timezone · overlap policy · enabled · catch-up window · last slot)
        │  evaluate against "now"
        ▼
 ┌──────────────────────────────────┐
│  scheduling  ◄── HERE             │  which minute-slots are due? overlap? suspended?
 │                                   │  key = sha256(service + revision + slot)
 └──────────────────────────────────┘
        │  admit due slot(s)  (trigger: schedule)  through the EXISTING ManagedRunAdmissionPort
        ▼
 agent-services run admission  ->  one AgentRun per slot (deduped by @@unique([siloId, key]))
```

**In this flow:** [agent-services](../../agent-services/main/README.md) *(owns the admission port + the run substrate)*

Invariant: the scheduler opens **no second run-creation path**. Every due slot is admitted through
`ManagedRunAdmissionPort.admitManagedRun` with `trigger: schedule` and the deterministic idempotency
key `sha256(agentServiceId + agentRevisionId + scheduledSlot)`. Because the key encodes the slot,
two concurrent ticks collapse to one durable run on the existing `@@unique([siloId,
requestIdempotencyKey])` — one tick sees `accepted`, the other `idempotent`. A disabled schedule is
suspended (no evaluation); a malformed cron or timezone fails closed.

For overlap, `allow` admits every due catch-up slot. `skip` admits only the oldest due slot when no
prior scheduled run is active, and skips every due slot when a prior scheduled run is active. That
keeps a delayed scheduler from creating a burst of concurrent runs for the same managed agent.

## Public surface

- `__RunScheduleTick` — evaluate one schedule at one instant and admit every due slot idempotently.
- `__DueScheduledSlots`, `__ParseCronExpression`, `__CronMatchesWallClock`, `__WallClockInZone`,
  `__IsValidCronExpression`, `__IsValidTimezone` — the cron + timezone evaluation primitives.
- `__ScheduledRunIdempotencyKey` — the deterministic per-slot key.
- `__NextBackoffDelayMs` — deterministic retry-delay hint for a transient admission failure.
- Types: `AgentServiceSchedule`, `ScheduleOverlapPolicy`, `ScheduleTickDependencies`,
  `ScheduleTickResult`, `ScheduledSlotOutcome`, `ActiveScheduledRunLookup`, `RetryBackoffPolicy`,
  `ScheduleClock`, `CronExpression`, `WallClock`, `DueScheduledSlotsOptions`.

## Boundary

The application composes a tick over the `AgentServiceSchedule` repository, the shared
`ManagedRunAdmissionPort`, and an in-flight-run lookup, then runs it periodically. This package never
touches Prisma, Kubernetes, or Obot directly, and it never executes shell or business logic — it
decides which runs are due and delegates their creation.

## Dependency direction

Tagged `scope:agent-services` (it shares the managed-agent capability with the definition plane): it
may depend only on `scope:agent-services`, `scope:agents`, `scope:audit`, `scope:authorization`,
`scope:grants`, and `scope:shared`. It imports `ManagedRunAdmissionPort` from the sibling
`agent-services` package and never the reverse, so there is no cycle.

## Data & persistence

Stateless. The `AgentServiceSchedule` model it evaluates is owned by the sibling `agent-services`
package in `apps/opencrane/prisma/schema/agent-services.prisma`; this package only consumes its
dependency-light projection.

## See also

- Parent index: [agents](../../README.md)
- Siblings: [agent-services](../../agent-services/main/README.md) · [skills](../../skills/main/README.md) · [channel-targets](../../channel-targets/main/README.md)
