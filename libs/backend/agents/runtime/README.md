# Runtime — language-neutral execution boundary

> [backend](../../README.md) › [agents](../README.md) › runtime

The runtime group contains the authority that admits commands and candidates plus the Kubernetes
projection used by the separate agent-controller process. It does not contain a model driver or
durable transcript store.

## Map

| Package | What it owns |
| --- | --- |
| [`main`](./main/README.md) | Fenced command and candidate admission against durable run authority. |
| [`k8s-launcher`](./k8s-launcher/README.md) | Pure suspended Job and bounded NetworkPolicy resource construction. |

```
 durable run authority ──► main ──► accepted command/candidate
                            │
                            └────► k8s-launcher ──► suspended attempt Job
```

The domain authority stays dependency-light. The launcher is a separate `layer:infra` package so
Kubernetes types never leak into the core runtime rules.

## See also

- Parent index: [agents](../README.md)
- Personal run authority: [personal/runs](../personal/runs/main/README.md)
- Server stream transport: [agent-runtime-stream](../../../server/_infra/agent-runtime-stream/README.md)
