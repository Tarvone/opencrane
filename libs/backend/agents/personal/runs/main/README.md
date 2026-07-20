# @opencrane/backend/agents/personal/runs — agent-run attempt authority

> [backend](../../../../README.md) › [agents](../../../README.md) › personal › runs

## What it owns

This package is part of the **personal-agent product**. A **run** is one logical execution of a
user's agent. A run can fail or be cancelled and then be retried — but each retry is a new **attempt**
of the *same* run, not a new run. This package is the authority over that attempt lifecycle: it decides
when a fresh attempt may start, keeps a single run identity across all its attempts, and validates that
the Kubernetes workload actually doing the work is the one authorised for the current attempt.

```
 a terminal run (failed / cancelled)   +   retry request (expectedAttempt)
          │
          ▼
 ┌──────────────────────────────────────┐
 │   runs  ◄── HERE                       │  retryable? service active? revision current?
 │   · __StartNextRunAttempt              │  compare-and-swap attempt N → N+1
 │   · __ValidateRunWorkloadAssignment    │  Job/Pod identity == this attempt?
 └──────────────────────────────────────┘
          │  started (attempt++, outbox event) / trusted assignment / denied
          ▼
 run-owned outbox  ── dispatch picks up "RunAttemptRequested" and launches the workload
```

**In this flow:** [conversations](../../conversations/main/README.md) *(the started attempt appends its events there)* ·
dispatcher *(polls the outbox and launches the workload)*

`__StartNextRunAttempt` is a **compare-and-swap** retry state machine: it reads the run and its
AgentService authority as one snapshot, refuses unless the run is in a retryable terminal state and the
service is active with the exact revision the run pins, then atomically increments the attempt while
re-checking every one of those facts — closing the race where two retries fire at once. In the same
transaction it appends a `RunAttemptRequested` event to the **outbox** (a durable table the dispatcher
polls) so a started attempt can never be lost between deciding and launching.

`__ValidateRunWorkloadAssignment` is the mirror check at launch time: it accepts only a one-attempt
Job, confirms the workload's full identity (who / where / which attempt) matches the expected authority exactly, uses the fixed
`opencrane-agent-runtime` projected-token audience, and has not expired.

Invariant: one logical run keeps one identity; attempts only ever move forward under optimistic
concurrency (detect conflicts at commit time); and any mismatch or staleness is a fail-closed denial with a precise reason.

## Public surface

- `__StartNextRunAttempt(repository, command)` — start the next attempt of a run via compare-and-swap.
- `__ValidateRunWorkloadAssignment(assignment, expectation)` — confirm a workload is the one authorised for this attempt.
- `PrismaAgentRunAuthorityRepository` — the Prisma-backed adapter implementing the persistence port (atomic retry + outbox append).
- `AgentRunAuthorityRepository` / `AgentRunAuthoritySnapshot` — the persistence port and its consistent read shape.
- `StartNextRunAttemptCommand` / `StartNextRunAttemptResult`, `AtomicStartNextRunAttemptCommand` / `AtomicRunAttemptResult` — retry request/result and their atomic commit forms.
- `RunWorkloadAssignment` / `RunWorkloadAssignmentExpectation` / `RunWorkloadAssignmentDecision` — the workload-identity check inputs and verdict.

## Boundary

Consumed by the run-dispatch and workload-admission paths. It does not run the agent, schedule the
Pod, or emit run events — it only governs attempt state and workload identity. Unlike its sibling
authorities it ships its own Prisma adapter, so the atomic increment and outbox append stay in one
transaction; pure use cases still accept an injected port for testing.

## Dependency direction

Tagged `scope:personal-runs`: it may depend only on `scope:agents` (shared run models),
`scope:authorization`, `scope:personal-runs`, and `scope:shared` — never on apps or sibling domains.

## Data & persistence

Owns the `AgentRun` attempt counter and appends `RunOutboxEventKind.RunAttemptRequested` outbox rows,
both committed together via `PrismaAgentRunAuthorityRepository`.

## See also

- Parent index: [agents](../../../README.md)
- Siblings: [conversations](../../conversations/main/README.md) · [memory](../../memory/main/README.md) · [personas](../../personas/main/README.md)
