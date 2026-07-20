# agent-runtime-stream — runtime-initiated server transport

> [server/_infra](../README.md) › agent-runtime-stream

This library owns the narrow internal HTTP/SSE transport used by the personal-agent runtime shell:
bounded JSON, projected-token verification seam, authenticated outbound stream framing, heartbeats,
and candidate forwarding. It owns no assignment, lease, command ordering, run state, Prisma access,
or durable queue. Those are injected by `apps/opencrane` from the authoritative agent-runtime domain.

The current app composition intentionally supplies an idle authority: an authenticated shell may
remain connected and receive heartbeats, but no run command can be issued and no candidate can be
accepted until the controller slice exists. That is fail-closed rather than a legacy or static-token
bridge.

## See also

- Runtime shell: [`apps/agent-runtime`](../../../../apps/agent-runtime/README.md)
- Protocol frames: [`libs/contracts`](../../../contracts/README.md)
- Authoritative admission: [`libs/backend/agents/runtime`](../../../backend/agents/runtime/main/README.md)
