# @opencrane/backend/agents/runtime — runtime protocol authority

> [backend](../../../../README.md) › [agents](../../../README.md) › [runtime](../README.md) › main

## What it owns

This package is the checkpoint between OpenCrane and the process that executes a personal agent. The
executor may be implemented in any language; it receives commands and proposes results, but it does
not get to decide what is current or authoritative. This package owns that decision through the
language-neutral `AgentRuntimeProtocol v1`.

Before a command reaches an executor, it checks that the command belongs to the currently assigned
run attempt, carries the exact frozen input snapshot, arrives in order, and is still inside its lease.
When the executor proposes an event or outside action, it performs the mirror check before another
domain may persist or execute that proposal.

```
 OpenCrane run authority + immutable snapshot
          │ command + assignment + fence
          ▼
 ┌──────────────────────────────┐
 │ runtime protocol  ◄── HERE    │  command current? candidate replayed?
 └──────────────────────────────┘
          │ accepted candidate only
          ▼
 run / conversation / action authorities decide and persist the proposal
```

**In this flow:** [personal/runs](../../personal/runs/main/README.md) · [personal/conversations](../../personal/conversations/main/README.md)

Invariant: an executor can only propose a result for a command OpenCrane already accepted for the
exact current attempt and lease. Duplicate command or candidate identifiers are idempotent; stale,
expired, out-of-order, malformed, or mismatched frames are denied with a stable reason.

It intentionally owns no HTTP listener, Kubernetes resource, model driver, provider credential,
tool execution, or direct persistence adapter. The app composes it with the stream transport and
the existing run/conversation authorities; a runtime can only submit candidates for those
authorities to accept or reject.

## Public surface

- `__AdmitRuntimeCommand` — validates a control-plane command before stream delivery.
- `__AdmitRuntimeCandidate` — validates a runtime-proposed event or deferred action.
- `RuntimeAttemptAuthority` — exact durable facts the owning run authority must supply at the final
  acceptance fence.
- `RuntimeCommandAdmission*` / `RuntimeCandidateAdmission*` — typed allow, idempotent, or fail-closed
  decisions and their input ports.

## Boundary

The runtime opens its authenticated stream outward to OpenCrane. This library makes stale,
replayed, expired, mismatched, and terminal frames fail closed; it does not create an OpenClaw
compatibility path or a second durable event authority.

## Dependency direction

Tagged `scope:agent-runtime` (`layer:backend`): it may depend only on runtime, agent, personal-run,
personal-conversation, authorization, and shared contracts. It never imports an app, transport
adapter, model driver, or legacy runtime package.

## See also

- Parent group: [runtime](../README.md)
- Wire contract: [`@opencrane/contracts`](../../../../../contracts/README.md)
- Run authority: [personal/runs](../../personal/runs/main/README.md)
