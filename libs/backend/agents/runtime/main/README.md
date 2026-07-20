# @opencrane/backend/agents/runtime — runtime protocol authority

> [backend](../../../../README.md) › [agents](../../../README.md) › runtime

## What it owns

This package is the control-plane authority for the language-neutral
`AgentRuntimeProtocol v1`. It validates command and candidate frames against the immutable run
attempt, dispatch assignment, snapshot digest, stream sequence, expiry, and lease fence before a
runtime can affect canonical state.

```
 immutable run snapshot
          │ command + assignment + fence
          ▼
 ┌──────────────────────────────┐
 │ runtime protocol  ◄── HERE    │  command current? candidate replayed?
 └──────────────────────────────┘
          │ accepted candidate only
          ▼
 run and conversation authorities
```

**In this flow:** [personal/runs](../../personal/runs/main/README.md) · [personal/conversations](../../personal/conversations/main/README.md)

Invariant: a runtime can only propose a result for one dispatched, unexpired command and a live
attempt lease. Duplicate candidates report the earlier result; everything else is denied.

It intentionally owns no HTTP listener, Kubernetes resource, model driver, provider credential,
tool execution, or direct persistence adapter. The app composes it with the stream transport and
the existing run/conversation authorities; a runtime can only submit candidates for those
authorities to accept or reject.

## Public surface

- `__AdmitRuntimeCommand` — validates a control-plane command before stream delivery.
- `__AdmitRuntimeCandidate` — validates a runtime-proposed event or deferred action.
- `RuntimeAttemptAuthority` — exact durable facts needed at the final acceptance fence.

## Boundary

The runtime opens its authenticated stream outward to OpenCrane. This library makes stale,
replayed, expired, mismatched, and terminal frames fail closed; it does not create an OpenClaw
compatibility path or a second durable event authority.

## Dependency direction

Tagged `scope:agent-runtime` (`layer:backend`): it may depend only on runtime, agent, personal-run,
personal-conversation, authorization, and shared contracts. It never imports an app, transport
adapter, model driver, or legacy runtime package.

## See also

- Parent index: [agents](../../../README.md)
- Wire contract: [`@opencrane/contracts`](../../../../../contracts/README.md)
- Run authority: [personal/runs](../../personal/runs/main/README.md)
