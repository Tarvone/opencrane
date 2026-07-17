# Personal-agent platform R0 migration contract

Status: **draft for approval; rewrite-freeze route remains provisional**

Issue: [#252](https://github.com/italanta/opencrane/issues/252)

This contract records the conservative migration posture implied by the repository and reachable
estate. It does not authorize a reset, secret export, maintenance window, or cutover commit.

## Clean-green rule

Green is built as if the legacy implementation had never been in production. Nothing in green may
exist solely to accept a legacy protocol, schema, workspace/plugin shape, configuration flag, or
runtime behavior. There is no dual read/write path, compatibility mode, raw database copy, or
reverse bridge.

Legacy work stops at evidence, disposition, and the smallest one-way semantic export required for
explicitly approved non-reproducible user-owned data. The exporter writes only green contracts and
is deleted with the rest of the migration factory after cutover. Derived state is rebuilt from
green authorities; obsolete state is archived or dropped with the required approval. An
unclassified ClusterTenant is cutover-ineligible and does not justify broad compatibility work.

## Data-disposition ledger

The machine-readable [R0 data-disposition map](personal-agent-platform-r0-data-disposition.json)
expands this ledger across every current Prisma model, migration-derived retired table/column,
repository-derived CRD spec/status and PVC, and the versioned upstream-store registry. Its validator
rejects missing, duplicate, or stale source-derived entries as well as compatibility, dual paths,
legacy-store/credential/identity/key adoption, and reverse bridges. Every row remains a candidate
until its required owner approval is recorded; map coverage does not authorize migration or R1.

| Legacy state | Default disposition | Green authority | Cutover rule |
|--------------|---------------------|-----------------|--------------|
| Fleet ClusterTenant identity, membership, role, owner subject, lifecycle revision | Migrate | Fleet lifecycle/membership contract | Preserve stable public IDs; capture one revision at lease acquisition |
| UserTenant desired state and AccessPolicy intent | Migrate semantics; archive raw manifests | Silo Postgres policy/agent state | Repair drift first; never import duplicate fleet-namespace CRs as extra agents |
| CRD status, Deployments, Services, Ingress, NetworkPolicy, PVC status | Rebuild | Kubernetes execution state | Preserve as signed evidence only; green reconciles from business authority |
| OpenClaw sessions, transcripts, tool events, in-flight state, schedules | Migrate for full-fidelity; archive/drop only with reset approval | Thread, Message, Run, RunEvent, Approval, Schedule | Preserve order, IDs, timestamps, ownership, interrupted state, and pause triggers |
| Uploads, generated files, workspace bytes | Migrate for full-fidelity | ArtifactStore canonical bytes and ArtifactVersion metadata | Hash every byte and resolve every transcript/tool reference |
| Mutable persona files and TenantWorkspaceDoc | Migrate after conflict resolution | PersonaRevision | Hash both sources; conflict blocks import |
| Cognee personal/user/agent/organization memory | One-way semantic export/import of owner-approved non-reproducible memory | Fresh Cognee durable supporting memory; OpenCrane policy, scope, grants, and persona authority | Record source dataset identity, scope, provenance, and stable subject binding as migration metadata; never adopt the legacy database |
| Cognee artifact/company-document indexes | Rebuild | Canonical ArtifactVersions, company-document versions, and events; Cognee derived index | Prove reproducibility before discarding any legacy dataset |
| Company docs and versions | Migrate approved current versions; archive required history | Versioned company-document authority | Preserve IDs, hashes, publication order, and unresolved proposals |
| Grants and Groups | Migrate semantic decisions | Per-silo authorization facade | Preserve current priority/Deny/timestamp behavior until approved replacement |
| TenantDatasetMembership and membership projections | Rebuild | Derived projection | Recompute from approved membership/grants revision |
| MCP catalog, assignment, grants | Migrate semantics | OpenCrane catalog/grant authority | Verify every server/tool contract against live Obot state |
| Obot installs and credential references | Archive non-secret intent; reconnect in green | Obot credential custody | Never adopt legacy credential identity or key material; a random/local `credentialRef` is not proof of an upstream recoverable credential |
| Skill bundles, entitlements, posture, provenance | Migrate bytes/digests and current decisions | SkillRevision plus ArtifactStore | Verify digest; rebuild runtime copies; retire Zot/registry fallback |
| ProviderCredential and model definitions | Migrate non-secret intent; rotate/recreate credentials and upstream registrations | OpenCrane metadata plus secret manager/LiteLLM | Never export raw keys; validate every model against a usable green credential |
| Legacy ProviderApiKey raw rows | Rotate then drop | Secret manager | Never put raw legacy values in migration artifacts |
| LiteLLM keys, teams, budgets, models, encrypted provider state | Rebuild from approved non-secret intent; archive evidence, then drop legacy state | Fresh LiteLLM projection of approved OpenCrane policy | Recreate teams, budgets, and models; mint new keys; never adopt the legacy database, encrypted state, master key, or salt |
| AuditEntry and upstream audit/trace stores | Archive/migrate according to retention policy | Append-only audit authority | Do not claim best-effort application audit is complete |
| Awareness participation/rollout state | Archive required safety evidence, then drop | None in green | No compatibility behavior in green |
| SessionScope, BrokeredDevice, pairing, browser cache, OIDC process sessions | Archive named evidence, then drop | Green identity/run authority | Never reconstruct authorization from legacy rows; force re-login |
| Metrics, measurements, proposals, spend snapshots | Archive if operational/financially required; rebuild live projections | Observability and approved cost authority | Reconcile against upstream LiteLLM/Langfuse before archive |

Migrate means a bounded, deterministic, one-way semantic exporter and idempotent green importer with
a manifest. It preserves only the approved meaning required by the target contract, never the old
mechanism, and never means copying an entire legacy database into green.

## Credential and reconnect ledger

| Credential class | Default action | Evidence required before changing default |
|------------------|----------------|-------------------------------------------|
| Human OIDC browser session | Drop; force sign-in | None; session is ephemeral |
| Fleet/silo service identity | Mint distinct green credential; revoke blue at commit | Signed workload identity and least-privilege binding tests |
| Provider BYOK | Rotate/recreate green Secret and LiteLLM registration | Owner consent plus verified green custody and a usable registration |
| Legacy raw ProviderApiKey | Force rotation/reconnect | No adoption of raw database value |
| Tenant/Cognee LiteLLM virtual key | Mint green key | No exception; legacy key, database, master key, and salt are not adopted |
| Cognee user/agent/silo identity | Reprovision in green and attach approved semantic memory imports | Stable subject binding, owner-approved dataset export manifest, and green isolation proof |
| Obot static/OAuth/user credential | Reconnect | Recreate green custody with owner consent; legacy credential identity and key material are not adopted |
| MCP install `credentialRef` | Treat as unverified intent | Matching live Obot credential and successful scoped tool call |
| Slack/third-party source token | Reconnect | External owner consent and approved secret-manager target |
| Static OpenCrane API/break-glass token | Revoke and drop | Any green emergency access is a separate security-approved, audited, short-lived IAM capability, never a compatibility token |
| Tenant encryption key | Never copy into green | Temporary migration-tool custody only for an approved decrypt/re-encrypt operation, with an evidence ledger and immediate revocation |
| Langfuse/optional upstream secrets | Recreate or archive store | Approved continuity requirement plus all encryption/session keys |

No credential value is included in the R0 repository evidence.

## Cutover lease and writer contract proposal

1. Acquire a fleet-owned lease for exactly one ClusterTenant and capture fleet lifecycle/membership
   revision `F0` plus blue generation `B0`.
2. Reject or queue new lifecycle/membership mutations after `F0`; do not apply them to blue or green
   while ownership is ambiguous.
3. Quiesce schedules, new runs, external side effects, and credential mutations.
4. Snapshot blue and export from the checkpoint-bound, read-only generation.
5. Import green idempotently, verify manifests and credentials, and keep green network-quarantined.
6. Before commit, abort restores signed `B0` and replays queued mutations after a consistency check.
7. Commit atomically changes the active slot, writer ownership, routing, and credential custody.
8. After green accepts writes or side effects, recovery is forward under ADR 0006. If the
   organization requires post-write reverse rollback, this route is invalid and cutover does not
   start.
9. Replay queued mutations against the committed owner only, in captured revision order.
10. Keep blue immutable for the approved retention window, then revoke/delete it through R10.

Lease duration, mutation queue authority, and operational owner are pending approval.

## Rollback decision

ADR 0006 defines the engineering route: rollback is safe before green writes; recovery is forward
after commit. R0 must still answer whether the organization requires post-write reverse rollback.

- If **no**, the rewrite-freeze route remains viable subject to the other gates.
- If **yes**, stop this route and separately plan the strangler/hybrid strategy. A reverse event or
  side-effect bridge is not part of clean green.

Current answer: **pending**. Implementation cannot assume “no.”

## Cohort and maintenance proposal

Proposed order: owner-approved reset candidate → least-state full-fidelity cohort → richest
full-fidelity cohort last.

The importer plus verification must complete within half the approved maintenance window so abort
and blue restore retain equal time. Pending operating proposal: set the maximum window to four
hours, measured from entering maintenance until green commit or restored blue service, and require
import plus verification to qualify within two hours. No maximum window has been approved, so R7
cannot claim timing qualification yet.

## Ownership and approval ledger

| Responsibility | Required owner | Assignment |
|----------------|----------------|------------|
| Product contract and per-ClusterTenant reset/full-fidelity approval | Product/customer owner | Pending |
| Retention and deletion | Legal/security/data owner | Pending |
| Post-write rollback strategy decision | Product + operations + program sponsor | Pending |
| Credential rotation/recreation/reconnect and revocation | Security/integration owner | Pending |
| Fleet lease/revision and mutation queue | Fleet owner | Pending |
| Export/import implementation | Migration owner | Pending |
| Blue maintenance and restore | Blue operations owner | Pending |
| Green runtime/platform | Runtime/platform owners | Pending |
| Independent acceptance and commit point | Go/no-go signer, not migration executor | Pending |
| Budget, duplicate-stack capacity, schedule, on-call coverage | Program sponsor | Pending |

R0 cannot close while these assignments or the post-write rollback answer are pending.

> See also: [estate evidence index](personal-agent-platform-r0-evidence-index.md),
> [product contract](personal-agent-platform-r0-product-contract.md),
> [approval record](personal-agent-platform-r0-approval-record.md), and
> [ADR 0006](../adr/0006-rewrite-freeze-whole-silo-cutover.md).
