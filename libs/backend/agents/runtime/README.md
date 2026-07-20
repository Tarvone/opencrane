# Runtime — language-neutral agent execution boundaries

> [backend](../../README.md) › [agents](../README.md) › runtime

## Map

| Package | What it owns |
| --- | --- |
| [`main`](./main/README.md) | Admission of runtime commands and candidate output against the current durable attempt authority. |

```text
OpenCrane run authority
        │ command + current attempt/assignment/fence
        ▼
runtime/main  ◄── HERE
        │ accepted command / admitted candidate / precise refusal
        ▼
transport or executor supplied by later Phase E packages
```

The runtime group owns the boundary between canonical OpenCrane state and any process that executes
an agent. It is language-neutral: a Python, TypeScript, or future runtime must satisfy the same
versioned command, assignment, sequence, expiry, lease, and replay rules.

## Dependency rule for this tier

Runtime packages may consume shared contracts/models and the narrow authority ports needed to check
one attempt. They must not import an app, transport adapter, Kubernetes client, model driver, or
legacy OpenClaw runtime. Canonical run/event persistence remains in its owning backend domain.

## See also

- Parent group: [agents](../README.md)
- Current authority: [runtime/main](./main/README.md)
- Personal-run authority: [personal/runs](../personal/runs/main/README.md)
