# @opencrane/server/_infra/agent-runtime-stream — runtime-initiated transport

> [server](../../README.md) › [_infra](../README.md) › agent-runtime-stream

## What it owns

This package is the OpenCrane server's narrow transport for personal-agent runtimes. It turns an
outbound request from a runtime Pod into an authenticated stream with bounded inbound requests,
without becoming an authority over runs, commands, or agent output.

The transport first asks an injected TokenReview adapter which Kubernetes Pod presented the
credential. It then validates the stream opening frame, emits only commands supplied by an injected
domain authority, and forwards runtime candidates back to that authority for acceptance or refusal.
Heartbeats keep an idle connection alive without inventing work.

```text
 agent-runtime Pod
       │ projected identity + validated HTTP/SSE exchange
       ▼
 ┌──────────────────────────────────────┐
 │ agent-runtime-stream  ◄── HERE        │  authenticate and frame only
 └───────────────┬──────────────────────┘
                 │ verified identity + parsed command/candidate
                 ▼
 personal-agent run authority ........ decides and persists
```

**In this flow:** [agent-runtime](../../../../apps/agent-runtime/README.md) ·
[runtime authority](../../../backend/agents/runtime/main/README.md) ·
[wire contracts](../../../contracts/README.md)

Invariant: transport syntax never becomes business authority. A token/Pod mismatch, malformed input,
non-monotonic command, oversized request body, or unavailable injected authority fails closed. The
package does not repair identity, choose a run, mint a command, or persist a candidate.

## Public surface

- `_RegisterInternalAgentRuntimeStream(options)` — builds the internal Express router for the
  authenticated stream and candidate endpoints.
- `RuntimeTokenReviewer` — port through which the OpenCrane app verifies projected Kubernetes
  credentials.
- `RuntimeCommandStreamAuthority` — port through which the personal-agent domain supplies commands
  and admits candidate output.
- `RuntimeStreamTransportOptions` — fixed body, heartbeat, and polling limits plus the two authority
  ports.

## Boundary

This is server-owned infrastructure, not a personal-agent domain. It owns HTTP parsing,
server-sent-event framing, heartbeats, credential extraction, TokenReview delegation, and tracing.
It owns no Prisma client, assignment lookup, lease, command ordering source, candidate persistence,
runtime process, or Kubernetes mutation.

The current OpenCrane composition injects an idle authority, so an authenticated shell can stay
connected but receives no command and has every candidate refused. That is an explicit greenfield
fail-closed state, not a compatibility bridge.

## Dependency direction

Tagged `scope:agent-runtime-stream` and `layer:infra`. It may import shared contracts and
observability, while the `apps/opencrane` entrypoint injects business-authority adapters. It must not
import apps, Prisma, or backend persistence implementations.

## Runtime & config

The composing app supplies maximum request bytes, heartbeat interval, command-poll interval, the
TokenReview port, and the command/candidate authority. This library reads no environment variables
and opens no listener by itself.

## See also

- Parent index: [_infra](../README.md)
- Runtime process: [agent-runtime](../../../../apps/agent-runtime/README.md)
- Runtime authority: [backend/agents/runtime](../../../backend/agents/runtime/main/README.md)
- Shared protocol: [contracts](../../../contracts/README.md)
