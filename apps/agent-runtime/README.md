# agent-runtime — outbound-only personal-agent shell

> [apps](../README.md) › agent-runtime

This is the first-party process boundary for a user's personal agent. It opens a single
projected-token-authenticated stream to the OpenCrane server and has **no listener, Service,
Ingress, Kubernetes RBAC, model provider, tool implementation, artifact client, or persistent
tenant mount**. It is disabled by default. The only writable mount is bounded `emptyDir` scratch.

The shell deliberately does not execute a received command yet. The server transport verifies its
identity and emits only authority-owned commands; a later controller/executor slice will bind the
current assignment, command dispatcher, and candidate admission to the durable run authority.

## See also

- Server transport: [`libs/server/_infra/agent-runtime-stream`](../../libs/server/_infra/agent-runtime-stream/README.md)
- Runtime protocol: [`libs/contracts`](../../libs/contracts/README.md)
- Deployment composer: [`apps/_infra/deploy-k8s`](../_infra/deploy-k8s/README.md)
