# @opencrane/backend/agents/personal/runs — agent-run attempt authority

> [backend](../../../../README.md) › [agents](../../../README.md) › personal › runs

## What it owns

This package is part of the **personal-agent product**. A **run** is one logical execution of a
user's agent. A run can fail or be cancelled and then be retried — but each retry is a new **attempt**
of the *same* run, not a new run. This package is the authority over that attempt lifecycle: it decides
whether the first run may be admitted, freezes its complete input snapshot, decides when a retry may
start, keeps a single run identity across all attempts, and validates that the Kubernetes workload
actually doing the work is the one authorised for the current attempt.

```
 request + current authorities ──► immutable input snapshot + accepted run
                                      │
 a terminal run (failed / cancelled)  │  + retry request (expectedAttempt)
          │
          ▼
 ┌──────────────────────────────────────┐
 │   runs  ◄── HERE                       │  retryable? service active? revision current?
 │   · PrismaRunAdmissionRepository       │  one run + snapshot + outbox transaction
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

`__ValidateRunWorkloadAssignment` is the mirror check at launch time: it confirms the workload's full
identity (who / where / which attempt) matches the expected authority exactly and has not expired.

Initial admission is also all-or-nothing. `PrismaRunAdmissionRepository` serialises a user's
idempotency key, lets the session assembler re-read every authority inside that transaction, and then
persists the logical run, its only `RunInputSnapshot`, and its ordered acceptance/dispatch events
together. A duplicate returns the original frozen snapshot instead of compiling against newer state.

Invariant: one logical run keeps one identity; attempts only ever move forward under optimistic
concurrency (detect conflicts at commit time); and any mismatch or staleness is a fail-closed denial with a precise reason.

## Public surface

- `__StartNextRunAttempt(repository, command)` — start the next attempt of a run via compare-and-swap.
- `__ValidateRunWorkloadAssignment(assignment, expectation)` — confirm a workload is the one authorised for this attempt.
- `PrismaAgentRunAuthorityRepository` — the Prisma-backed adapter implementing the persistence port (atomic retry + outbox append).
- `PrismaRunAdmissionRepository` — atomically deduplicates and persists the first run, its immutable
  input snapshot, and both initial outbox events.
- `__DigestRunInputSnapshot` — computes the canonical SHA-256 identity of every frozen runtime input.
- `RunAdmissionRepository` and its command/result types — transaction boundary used by the session
  assembler to load and commit against one authority view.
- `AgentRunAuthorityRepository` / `AgentRunAuthoritySnapshot` — the persistence port and its consistent read shape.
- `StartNextRunAttemptCommand` / `StartNextRunAttemptResult`, `AtomicStartNextRunAttemptCommand` / `AtomicRunAttemptResult` — retry request/result and their atomic commit forms.
- `RunWorkloadAssignment` / `RunWorkloadAssignmentExpectation` / `RunWorkloadAssignmentDecision` — the workload-identity check inputs and verdict.

## Boundary

Consumed by the session-assembly, run-dispatch, and workload-admission paths. It does not choose
persona, memory, tools, models, or budgets and does not run or schedule the agent; those inputs arrive
through other authorities and this package only seals and persists their accepted coordinates. Unlike its sibling
authorities it ships its own Prisma adapter, so the atomic increment and outbox append stay in one
transaction; pure use cases still accept an injected port for testing.

## Dependency direction

Tagged `scope:personal-runs`: it may depend only on `scope:agents` (shared run models),
`scope:authorization`, `scope:personal-runs`, and `scope:shared` — never on apps or sibling domains.

## Data & persistence

Owns `AgentRun`, `RunInputSnapshot`, the attempt counter, and the run outbox in
`apps/opencrane/prisma/schema/runs.prisma`. Initial admission commits the first run, snapshot,
`RunAccepted`, and `RunAttemptRequested` together; retry commits the next attempt and request event
together. A failed transaction exposes none of those rows.

## See also

- Parent index: [agents](../../../README.md)
- Siblings: [conversations](../../conversations/main/README.md) · [memory](../../memory/main/README.md) · [personas](../../personas/main/README.md)
