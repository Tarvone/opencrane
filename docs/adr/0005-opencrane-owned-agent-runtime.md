# ADR 0005 — OpenCrane-owned agent runtime

- **Status:** Accepted
- **Date:** 2026-07-16
- **Task:** `#245` — Phase A decision record
- **Supersedes / superseded by:** supersedes the 2026-06-19 decision to retain OpenClaw as the
  platform runtime
- **Related:** [`personal-agent-platform-architecture.md`](../design/personal-agent-platform-architecture.md) ·
  [`openclaw-agent-loop-replacement-plan.md`](../design/openclaw-agent-loop-replacement-plan.md)

## Context

The 2026-06-19 direction retained OpenClaw because it already supplied the personal-agent gateway,
session, transcript, compaction, tool-loop, workspace, channel, and plugin behavior. The product
roadmap has since pivoted: a person's assistant is the primary product and the front door to company
agents, artifacts, memory, skills, approvals, schedules, and tools.

OpenCrane already owns, or must own, the surrounding authority: OIDC and channel ingress, tenant and
run identity, authorization, transcript/event durability, persona, memory policy, MCP grants,
artifacts, skills, budgets, scheduling, workload isolation, approvals, retry, and audit. Keeping
OpenClaw as a permanent peer would preserve two runtime contracts, two transcript/session models,
and a large translation surface.

The trigger for revisiting the June decision has therefore fired: **roadmap divergence caused by the
personal-agent product pivot**.

## Decision

OpenCrane will own the personal and managed-agent runtime end to end:

- OpenCrane owns canonical `Thread`, `Message`, `Run`, ordered `RunEvent`, approval, transcript,
  context/compaction, retry, cancellation, budgets, identity, memory, and tool policy.
- One exact-pinned TypeScript toolkit drives only the bounded model/tool loop behind an
  OpenCrane-owned `AgentLoopDriver` contract.
- Python remains available for isolated authoring/tool Jobs; it is not a second conversational
  runtime.
- The target runtime contains no OpenClaw package, protocol, config renderer, transcript mirror,
  workspace compatibility, plugin hook, or reverse bridge.
- The OpenClaw image, installer, runtime, protocols, schemas, configuration, and deployment wiring
  are deletion targets. They are not dependencies, fixture sources, behavior oracles, or
  conformance baselines for the replacement.

The TypeScript toolkit is deliberately **not** selected by this ADR. Gate L4 runs
`@openai/agents` and `ai`/`ToolLoopAgent` against the same independently authored target fixtures and
real target LiteLLM matrix. It records one winner and exact dependency pins; the losing production
adapter is removed.

## Alternatives considered

- **Retain a lean OpenClaw runtime permanently** — rejected. It shortens the runtime build but keeps
  the config/protocol/plugin/workspace/session compatibility tax indefinitely.
- **Run OpenClaw and an owned toolkit as permanent peers** — rejected. It creates two authorities
  and two operating matrices instead of replacing the obsolete runtime.
- **Embed a second loop inside OpenClaw** — rejected. It adds a loop without removing the larger
  OpenClaw runtime shell.
- **Select a toolkit in the architecture ADR** — rejected. Provider, approval-resume,
  cancellation, retry, event, and telemetry behavior must be measured by Gate L4.

## Consequences

- OpenCrane assumes production responsibility for session correctness, reconnect, cancellation,
  compaction, recovery, approval resume, and run persistence.
- Runtime fixtures are authored from the accepted product contract, not observed or derived from
  OpenClaw behavior.
- CI forbids OpenClaw and retired-domain imports in replacement code from the first implementation
  PR.
- Each replacement slice deletes the OpenClaw installer, runtime, protocol, workspace,
  pairing/device, transcript compatibility, tests, configuration, and deployment wiring it makes
  obsolete.
