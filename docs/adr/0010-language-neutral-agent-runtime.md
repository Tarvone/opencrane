# ADR 0010 — Language-neutral agent runtime (Pydantic AI first qualification)

- **Status:** Accepted 2026-07-21
- **Date:** 2026-07-21
- **Task:** `#246` — Phase E runtime boundary
- **Supersedes / superseded by:** supersedes the exact-pinned **TypeScript-toolkit** clause and the
  Gate L4 (`@openai/agents` vs `ai`/`ToolLoopAgent`) framing of [ADR 0005](0005-opencrane-owned-agent-runtime.md);
  ADR 0005 otherwise stands (OpenCrane owns the runtime end to end; OpenClaw is a deletion target).
- **Related:** [ADR 0005](0005-opencrane-owned-agent-runtime.md) · [ADR 0007](0007-direct-target-refactor.md) ·
  [ADR 0008](0008-target-agent-contracts-and-workload-identity.md) ·
  [`personal-agent-platform-architecture.md`](../design/personal-agent-platform-architecture.md) ·
  [`openclaw-agent-loop-replacement-plan.md`](../design/openclaw-agent-loop-replacement-plan.md)

## Context

ADR 0005 established that OpenCrane owns the personal and managed-agent runtime end to end, and
specified that "one exact-pinned **TypeScript** toolkit" would drive the bounded model/tool loop,
selected by a Gate L4 bake-off between `@openai/agents` and `ai`/`ToolLoopAgent`.

Since then the Phase E runtime boundary has actually been built (#312–#325): a separately deployed
runtime **workload** behind a language-neutral `AgentRuntimeProtocol v1`, which opens an
authenticated outbound command stream and receives fenced `start_attempt`/`resume_attempt`/
`cancel_attempt` frames. The runtime is a replaceable workload behind that protocol — it holds no
durable authority, no Kubernetes RBAC, no Postgres access, and no provider secret. Under that design
the runtime's implementation language is not a product contract.

The team is Python-fluent, and `pydantic-ai-slim` is a strong candidate for the bounded loop. The
TypeScript-only framing in ADR 0005 no longer matches the built boundary, and #246 was rewritten
around a language-neutral protocol with Pydantic AI as the first candidate. This ADR records that
decision so the plan, the ADR set, and the shipped code agree.

## Decision

- The runtime boundary is **language-neutral** behind `AgentRuntimeProtocol v1`. The control plane
  remains TypeScript; the runtime workload may be implemented in any language. Language is never a
  public or durable OpenCrane contract.
- **`pydantic-ai-slim[openai]==2.13.0` (Python) is the first qualification candidate** for the
  bounded model/tool loop, connected to the per-silo LiteLLM proxy over its OpenAI-compatible
  adapter through an attempt-scoped credential. It is **not** an adopted production implementation
  by virtue of this ADR.
- **Adoption is recorded only after** the exact-pinned adapter passes every protocol, security,
  reliability, and **live-LiteLLM** conformance gate (the Gate-L4-equivalent for the language-neutral
  boundary). Opening #246 or building the qualification adapter is not acceptance.
- Qualify **one loop dependency at a time**. If Pydantic AI fails a hard gate, record the failing
  fixture, remove its adapter and pins, amend this ADR, and only then assess the next candidate —
  AgentScope (Java) is the research runner-up; the Vercel AI SDK is the thinnest TypeScript
  alternative.
- The framework owns **only** the bounded model/tool loop. Its classes, messages, event types, IDs,
  and checkpoints never cross the adapter into public or durable OpenCrane contracts. OpenCrane
  retains retry/fallback, aggregate budgets, cancellation, steering, approval, and terminal
  authority; implicit provider/tool/output retries are configured and proven zero.
- The runtime stays barred from being a second authority: no direct Postgres, no Kubernetes RBAC, no
  provider secret. **Deterministic input compilation remains TypeScript-owned in the control plane**;
  the runtime consumes opaque compiled input, never re-deriving persona/prompt/tool assembly.

## Alternatives considered

- **Keep the TypeScript-only toolkit (ADR 0005 as written)** — rejected. The built boundary is
  already language-neutral and the runtime line (#312–#325) is Python; forcing TypeScript would
  rework shipped slices for no product benefit, against a Python-fluent team.
- **Make the runtime language a product contract** — rejected. The protocol exists precisely to make
  the runtime a replaceable workload; pinning its language in a public contract removes that freedom.
- **Adopt Pydantic AI outright without a qualification gate** — rejected. Provider, approval-resume,
  cancellation, retry, event, and telemetry behaviour must be measured against independently authored
  fixtures and the real LiteLLM matrix first (carried over from ADR 0005's Gate L4 reasoning).

## Consequences

- **Reopen trigger:** if the qualified candidate fails a hard gate, language/toolkit selection
  reopens under the one-at-a-time rule, with AgentScope (Java) and the Vercel AI SDK (TypeScript) as
  the named fallbacks.
- The prompt/input compiler is a single TypeScript authority; the runtime treats compiled input as
  opaque delivered data.
- CI continues to forbid OpenClaw and retired-domain imports in replacement code; the runtime remains
  outbound-only and reaches LiteLLM only through an attempt-scoped, budget/alias-bound credential.
- A later explicit decision records the passing package lock, image digest, protocol version, and
  supported model matrix before the runtime is treated as supported.
