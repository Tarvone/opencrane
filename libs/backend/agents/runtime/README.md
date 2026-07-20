# Runtime — language-neutral agent execution boundaries

> [backend](../../README.md) › [agents](../README.md) › runtime

The runtime group owns the boundary between canonical OpenCrane state and any process that executes
an agent. It contains the authority that admits commands/candidates and the pure Kubernetes resource
contract the next controller slice will consume. It does not yet contain that controller, a model
driver, or a durable transcript store.

## Map

| Package | What it owns |
| --- | --- |
| [`main`](./main/README.md) | Admission of runtime commands and candidate output against the current durable attempt authority. |
| [`k8s-launcher`](./k8s-launcher/README.md) | Pure suspended Job and bounded NetworkPolicy resource construction. |

```text
OpenCrane run authority
        │ command + current attempt/assignment/fence
        ▼
runtime/main ── accepted command/candidate
        │
        └────► k8s-launcher ── suspended Job contract for the next controller slice
```

The boundary is language-neutral: a Python, TypeScript, or future runtime must satisfy the same
versioned command, assignment, sequence, issuance/expiry, lease, and replay rules. Kubernetes types
stay isolated in the `layer:infra` launcher rather than leaking into those core decisions.

## Dependency rule for this tier

Core runtime authority may consume shared contracts/models and narrow attempt-authority ports. The
launcher may additionally consume Kubernetes manifest types but performs no input/output. Neither may
import an app, transport adapter, model driver, or legacy OpenClaw runtime. Canonical run/event
persistence remains in its owning backend domain.

## See also

- Parent group: [agents](../README.md)
- Current authority: [runtime/main](./main/README.md)
- Job contract: [runtime/k8s-launcher](./k8s-launcher/README.md)
- Personal-run authority: [personal/runs](../personal/runs/main/README.md)
- Server stream transport: [agent-runtime-stream](../../../server/_infra/agent-runtime-stream/README.md)
