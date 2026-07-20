# @opencrane/backend/agents/personal/runs — agent-run attempt authority

> [backend](../../../../README.md) › [agents](../../../README.md) › personal › runs

## What it owns

This package is part of the **personal-agent product**. A **run** is one logical execution of a
user's agent, while an **attempt** is one try at completing that run. This package owns both ends of
that lifecycle: it admits the first run together with the immutable input snapshot it will always
use, then governs later attempts without changing the logical run or its frozen inputs.

```
 run request + idempotency key
          │  session assembles inputs inside this package's transaction
          ▼
 ┌──────────────────────────────────────────┐
 │   runs  ◄── HERE                          │  run + one snapshot + ordered outbox
 │   · PrismaRunAdmissionRepository          │  duplicate returns the first snapshot
 │   · __StartNextRunAttempt                 │  terminal run: attempt N → N+1
 │   · __ValidateRunWorkloadAssignment       │  Job/Pod identity == current attempt?
 └──────────────────────────────────────────┘
          │  accepted / retry started / assignment trusted / denied
          ▼
 run-owned outbox  ── controller claims it ── creates suspended Job ── commits Job UID
```

**In this flow:** [session](../../session/main/README.md) *(assembles the snapshot through this
package's admission boundary)* · [conversations](../../conversations/main/README.md) *(stores the
run's ordered user-visible events)* · dispatcher *(polls the outbox and launches the workload)*

Initial admission serialises the silo and request idempotency key before compiling any mutable
input. A duplicate request therefore returns the first durable snapshot instead of recompiling at a
later time. A new request locks the AgentService, lets the session assembler revalidate every input
inside that transaction, and commits the `AgentRun`, its only `RunInputSnapshot`, and the ordered
`RunAccepted` and `RunAttemptRequested` outbox events together. The canonical digest covers every
snapshot field except its own digest.

`__StartNextRunAttempt` is a **compare-and-swap** retry state machine: it reads the run and its
AgentService authority as one snapshot, refuses unless the run is in a retryable terminal state and the
service is active with the exact revision the run pins, then atomically increments the attempt while
re-checking every one of those facts — closing the race where two retries fire at once. In the same
transaction it appends a `RunAttemptRequested` event to the **outbox** (a durable table the dispatcher
polls) so a started attempt can never be lost between deciding and launching.

`__ValidateRunWorkloadAssignment` is the mirror check at launch time: it accepts only a one-attempt
Job, confirms the workload's full identity (who / where / which attempt) matches the expected authority exactly, uses the fixed
`opencrane-agent-runtime` projected-token audience, and has not expired.

`PrismaRunDispatchRepository` is the database side of the controller handshake. It issues a short,
server-owned claim lease over `RunAttemptRequested`, exposes only the coordinates needed to create a
suspended Job, and commits the Job UID as a `PendingPod` assignment together with the run's `Assigned`
state and outbox publication. The exact `claimedAt` plus `deliveryCount` pair is the compare-and-swap
fence: an expired claimant cannot overwrite a later reclaim. Both claim and commit also require the
snapshot's signed fleet-membership trust window to remain in the future according to database time.

Invariant: a logical run either commits with exactly one digest-sealed snapshot and its dispatch
event, or does not exist. Retries retain that run and snapshot identity, attempts only move forward
under optimistic concurrency, and any authority, membership, workload, lease, or persistence
uncertainty fails closed.

## Public surface

- `__StartNextRunAttempt(repository, command)` — start the next attempt of a run via compare-and-swap.
- `__ValidateRunWorkloadAssignment(assignment, expectation)` — confirm a workload is the one authorised for this attempt.
- `__DigestRunInputSnapshot(snapshot)` — compute the canonical SHA-256 identity of all frozen run
  inputs without digesting the self-referential `digest` field.
- `PrismaRunAdmissionRepository` — serialise duplicate requests and atomically persist the initial
  run, snapshot and ordered outbox events around a caller-supplied assembly callback.
- `RunAdmissionRepository`, `RunAdmissionCommand`, `RunAdmissionTransaction`,
  `RunAdmissionBuildResult` and `RunAdmissionResult` — the transaction-fenced initial-admission port
  and its input/output vocabulary.
- `PrismaAgentRunAuthorityRepository` — the Prisma-backed adapter implementing the persistence port (atomic retry + outbox append).
- `PrismaRunDispatchRepository` — atomically claim an attempt and commit its suspended Job assignment.
- `__CreateAgentControllerRunDispatchRouter` — projected-token-authenticated internal claim/commit API for the fixed `agent-controller` ServiceAccount.
- `RunDispatchRepository` / `AgentControllerTokenReviewer` — persistence and TokenReview ports used by that internal API.
- `AgentRunAuthorityRepository` / `AgentRunAuthoritySnapshot` — the persistence port and its consistent read shape.
- `StartNextRunAttemptCommand` / `StartNextRunAttemptResult`, `AtomicStartNextRunAttemptCommand` / `AtomicRunAttemptResult` — retry request/result and their atomic commit forms.
- `RunWorkloadAssignment` / `RunWorkloadAssignmentExpectation` / `RunWorkloadAssignmentDecision` — the workload-identity check inputs and verdict.

## Boundary

Consumed by the [session assembler](../../session/main/README.md), run-dispatch and workload-
admission paths. It does not choose persona, memory, tools, budgets or membership evidence; session
supplies those through the transaction callback. It does not run the agent, create/unsuspend the Job,
or expose the private input snapshot to the controller. It owns only the durable admission, attempt,
dispatch-lease, assignment, and workload-identity boundaries.

## Dependency direction

Tagged `scope:personal-runs`: it may depend only on `scope:agents` (shared run models),
`scope:authorization`, `scope:personal-runs`, and `scope:shared` — never on apps or sibling domains.

## Data & persistence

Owns `AgentRun`, its one `RunInputSnapshot`, and run-domain outbox rows in
`apps/opencrane/prisma/schema/runs.prisma`. Initial admission commits the run, snapshot,
`RunAccepted`, and first `RunAttemptRequested` event together; later retries atomically advance the
attempt counter and append another `RunAttemptRequested` event. Dispatch leases that event, persists
the immutable `WorkloadAssignment`, advances the run to `Assigned`, and publishes the event in one
transaction.

## See also

- Parent index: [agents](../../../README.md)
- Siblings: [session](../../session/main/README.md) · [conversations](../../conversations/main/README.md) · [memory](../../memory/main/README.md) · [personas](../../personas/main/README.md)
