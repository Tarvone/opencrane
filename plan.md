# OpenCrane — Active Plan

> **Rebased 2026-07-16 (evening): personal-agent program adopted.** Implementation detail lives
> in **GitHub issues** (context + todo checklists); this file is the sequencing index the work is
> driven from. When an item here is executed, work off the linked issue — not this file. History
> of everything landed before the rebase: `plan-done.md` + the git history of this file (the
> morning re-lettered plan is at commit `e2b0228`; the pre-rebase plan at `700473b` and earlier).

## Decision record (2026-07-16)

The [personal-agent platform architecture](docs/design/personal-agent-platform-architecture.md) is
**adopted** as the target, with the runtime refinement from the
[OpenClaw loop investigation](docs/design/openclaw-agent-loop-replacement-plan.md):

1. **End state:** an OpenCrane-owned agent runtime. OpenCrane owns Thread/Message/Run/RunEvent,
   approvals, transcript, compaction, retry, budgets, identity, memory, and tool policy; a
   conformance-selected **TypeScript** toolkit (`@openai/agents` primary spike, `ai`/`ToolLoopAgent`
   control) drives only the bounded model/tool loop. Python stays for isolated tool Jobs only.
   Supersedes the 2026-06-19 keep-OpenClaw decision (trigger: personal-agent product pivot).
2. **Delivery:** the [deletion-gated strangler](docs/design/personal-agent-platform-simplification-plan.md)
   over the [rewrite-freeze/blue-green alternative](docs/design/personal-agent-platform-rewrite-freeze-plan.md).
   Lean OpenClaw is a bridge with named expiries, never a peer runtime.
3. **Sequencing:** deletion debt is paid first (Phase A), then the runtime program is the spine
   (Phases B–E); platform authorities that don't gate the personal-agent cutover (artifact CAS,
   AgentService registry) follow as Phase F rather than blocking the runtime. This deliberately
   diverges from the simplification plan's W4/W5-before-W7 ordering: personal agents cut over on
   the **current** skill/memory authorities; managed agents wait for Phase F.
4. Authority/identity gates 2–9 of the architecture doc (Postgres authority, artifact-on-PVC,
   per-silo authorization + signed run capabilities, Cilium-not-RBAC, CRD retirement, isolated
   Python, controller/proxy extraction, no permanent dual runtime) are accepted with it.
   ADRs recording all of this are a Phase A deliverable (→ [#245](https://github.com/italanta/opencrane/issues/245)).

Toolkit choice is **not** pre-decided — Gate L4's conformance run decides it (→ [#246](https://github.com/italanta/opencrane/issues/246)).

## Current state (2026-07-16)

The silo program (S1–S6) is merged: fleet/silo split, Zitadel as PDP system-of-record with
per-org OIDC login, member API, S4 inheritance + scope vocabularies + dataset-membership sync,
BYOK provider keys, same-origin org ingress + gateway proxy (built, gated), org-memory (Cognee)
wired into tenant pods. Launch stabilisation (#144, #134), member onboarding (#126), and the bulk
of the Phase 3 repo cutover (#151, #152, #153 — on `phase3-cutover`, **pending merge**) are done.

Retired from the morning plan: #130 (scope-aware retrieval), #138 (teardown), #141 (devops-agents
spike), #131 (CLI polish) — closed; their residue pointers live in the issues themselves.

## Track 0 — live obligations (parallel; not program-gated)

Production and launch work that continues alongside the program. Nothing below waits for a phase.

| Item | Scope | Status |
|------|-------|--------|
| [#127](https://github.com/italanta/opencrane/issues/127) — **Isolation & domaining production defaults** | Mandatory default-deny (multi-CT) · per-CT hosts · encrypted tenant storage · GCP smoke + ACME e2e | Last launch-critical backend item — still the launch front. |
| [#174](https://github.com/italanta/opencrane/issues/174) — **LiteLLM Team provisioning bug** | team_id 404s on /key/update, unthrottled reconcile | Production bug; also a prerequisite for scoped runtime model access (Gate L3). |
| [#162](https://github.com/italanta/opencrane/issues/162) — **Chart-native OpenCrane UI rollout** | Enablement, migration, status, live verification | Needed before the UI carries cutover consoles. |
| `phase3-cutover` merge + [#150](https://github.com/italanta/opencrane/issues/150) close-out | Merge gated on e2e-k3d design call + subchart vendor-vs-publish decision | Bookkeeping; opencrane side done. |
| Frontend launch cutover (weownai) | weownai [#28](https://github.com/italanta/WeOwnAI/issues/28) + #30 | Cross-repo; see weownai's plan. |

## Program — personal-agent platform

Phases are the execution spine. Issues for a phase are cut when the phase opens; later-phase
issue rewrites follow the
[live-issue disposition table](docs/design/personal-agent-platform-simplification-plan.md#live-github-issue-disposition).

### Phase A — deletion debt (current front)

| Issue | Scope | Exit |
|-------|-------|------|
| [#245](https://github.com/italanta/opencrane/issues/245) — **W1 residue + docs drift + decision ADRs** | Dead shared-skills · CSV mcpPolicy/channels · configOverrides · canary/self-update · **immutable pinned bridge image** (= first Gate L0 deliverable) · pairing/BrokeredDevice · SessionScope · Obot-poll residue · Linkerd freeze+inventory · six-CRDs docs fix · ADR 0005/0006 + ADR 0003 correction | Forbidden-reference CI test; immutable-image cold-start/rollback green; no fallback without named expiry. |

Adjacent: [#135](https://github.com/italanta/opencrane/issues/135) stays blocked (external half);
[#227](https://github.com/italanta/opencrane/issues/227) fires after Phase A + rollback windows.

### Phases B/C — runtime foundation: canonical run plane → toolkit selection

One epic drives Gates L0–L4 (→ [#246](https://github.com/italanta/opencrane/issues/246)):
baseline fixtures + trajectory recorder (L0) · canonical Thread/Message/Run/RunEvent plane with
thread leases, idempotency, cursor replay, SSE (L1) · OpenClaw bridged **into** that plane so the
frontend consumes the canonical API while OpenClaw still executes (L2) · versioned
`RunInputSnapshot` + prompt compiler + LiteLLM/Obot/Cognee/skill adapters (L3) · conformance
bake-off and exact-pinned toolkit selection (L4).

Feeds from existing issues (rewritten as consumed): [#225](https://github.com/italanta/opencrane/issues/225)
(generic workspace/rendering stays; OpenClaw gateway/A2UI scope becomes bridge scope with expiry),
[#221](https://github.com/italanta/opencrane/issues/221) (full-KSA identity → run capabilities),
[#220](https://github.com/italanta/opencrane/issues/220) (least-privilege baseline on the bridge),
[#128](https://github.com/italanta/opencrane/issues/128) (Obot lifecycle, runtime-neutral MCP
assignment — L3's Obot adapter builds on it).

### Phase D — reliability envelope + personal runtime (Gate L5)

State machine, transactional event append + outbox, tool idempotency, budgets + no-progress
breaker, error taxonomy + retry matrix, provider-neutral compaction, one durable terminal event.
Go/no-go rule: session correctness, cancellation/recovery, and authorization must meet or beat the
OpenClaw baseline. Issue cut at phase open.

### Phase E — shadow, canary, cutover, delete (Gates L6–L7)

Fixture replay → side-effect-free shadow → dogfood silo → whole-tenant canaries → cutover →
**delete the entire OpenClaw compatibility surface** (installer, config renderer/schema, Gateway
v4 client + folds, workspace/persona compat, Cognee plugin lifecycle, losing toolkit adapter).
Rollback frontier: first canonical new-runtime write. Issues cut at phase open.

### Phase F — platform authorities & managed agents (W2–W5, W8–W9)

Opens once the personal runtime is past L4 (overlap with D/E where safe):

- **Trust-boundary apps + authorization** (W2/W3): channel-proxy and agent-controller extraction;
  `libs/authorization` contracts/engine; signed run capabilities; membership freshness.
  [#117](https://github.com/italanta/opencrane/issues/117) executes here (Cilium baseline, then
  Linkerd removal). [#221](https://github.com/italanta/opencrane/issues/221) generalizes here.
- **Artifact CAS + Cognee pipeline** (W4): artifact service, outbox indexer, memory gateway.
  Decides [#133](https://github.com/italanta/opencrane/issues/133) (skills → CAS; Zot demoted to
  optional export — do not run the Zot-only cutover first).
- **AgentService registry + scheduler + run ledger** (W5):
  [#129](https://github.com/italanta/opencrane/issues/129) promotes to the core epic; Slack worker
  re-lands as a scheduled AgentService.
- **Skills product** (W8): [#222](https://github.com/italanta/opencrane/issues/222) (safe
  authoring path — prerequisite) then [#243](https://github.com/italanta/opencrane/issues/243)
  (governed skill learning: nuances + promotion).
- **Consoles + managed-agent cutover** (W9): [#226](https://github.com/italanta/opencrane/issues/226)
  membership UI, [#224](https://github.com/italanta/opencrane/issues/224) cost/model console,
  [#216](https://github.com/italanta/opencrane/issues/216) CLI-retirement decision.

### Phase G — final topology & residue (W11–W12)

Tenant/AccessPolicy CRD retirement (after observation windows), duplicate-model collapse,
[#231](https://github.com/italanta/opencrane/issues/231) naming pass, docs/website/runbook sync,
CI checks against retired concepts. Issues cut at phase open.

## Deferred / research

| Issue | Scope | Status |
|-------|-------|--------|
| [#136](https://github.com/italanta/opencrane/issues/136) — Dedicated-compute tiers · guardrail stream · pooling/scale-to-zero | Re-lands as AgentService deployment profiles (Phase F+) | Future. |
| [#154](https://github.com/italanta/opencrane/issues/154) — Plugin system spike | Replaced per disposition: derive a small app/module contract from Cognee/Obot/artifact/runtime needs — no generic plugin framework first | Re-scope when Phase F opens. |
