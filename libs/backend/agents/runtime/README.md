# Runtime — language-neutral agent execution boundaries

> [backend](../../README.md) › [agents](../README.md) › runtime

The runtime group owns the boundary between canonical OpenCrane state and any process that executes
an agent. It contains command/candidate admission, pure Kubernetes resource construction, and the
controller that exact-creates/adopts a still-suspended attempt Job. After assignment, the controller
conditionally releases the exact Job and registers its unique first Pod. Authenticated bootstrap
exchange, model/tool-loop execution, and durable transcript ownership remain later boundaries.

## Map

| Package | What it owns |
| --- | --- |
| [`main`](./main/README.md) | Admission of runtime commands and candidate output against the current durable attempt authority. |
| [`k8s-launcher`](./k8s-launcher/README.md) | Pure suspended Job construction for the dedicated runtime namespace. |
| [`controller`](./controller/README.md) | Crash-safe assignment, UID-fenced Job release, and exact first-Pod registration. |

```text
OpenCrane run authority
        │ command + current attempt/assignment/fence
        ▼
runtime/main ── accepted command/candidate
        │
        └────► controller ──► k8s-launcher ──► suspended attempt Job
                                            │ assigned Job UID
                                            ▼
                                      conditional release
                                            │ first Pod UID
                                            └────► run authority
```

The boundary is language-neutral: a Python, TypeScript, or future runtime must satisfy the same
versioned command, assignment, sequence, issuance/expiry, lease, and replay rules. Kubernetes types
stay isolated in the `layer:infra` launcher rather than leaking into those core decisions.

## Dependency rule for this tier

Core runtime authority may consume shared contracts/models and narrow attempt-authority ports. The
launcher may consume Kubernetes manifest types but performs no input/output. The controller library
may depend on that launcher, shared contracts, and observability; it does not import the app that
composes it. No runtime package may import a model driver or legacy OpenClaw runtime. Canonical
run/event persistence remains in its owning backend domain.

## See also

- Parent group: [agents](../README.md)
- Current authority: [runtime/main](./main/README.md)
- Job contract: [runtime/k8s-launcher](./k8s-launcher/README.md)
- Assignment-and-release controller: [runtime/controller](./controller/README.md)
- Personal-run authority: [personal/runs](../personal/runs/main/README.md)
- Server stream transport: [agent-runtime-stream](../../../server/_infra/agent-runtime-stream/README.md)
