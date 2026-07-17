# Personal-agent platform R0 clean-build cutover contract

Status: **draft for approval; clean-build direction recorded, authority approvals pending**

Issue: [#252](https://github.com/italanta/opencrane/issues/252)

The filename is retained for stable links, but this is not a migration contract. Green starts empty.
This contract does not authorize an archive, deletion, maintenance window, or cutover commit.

## Clean-build rule

Green is built as if the legacy implementation had never been in production. No legacy data,
state, configuration, identity or identifier, credential, key, salt, schema, protocol, byte, or
semantic decision is transferred, imported, exported, copied, converted, rebuilt from blue, or
used to initialize green. There is no dual read/write path, compatibility mode, raw database copy,
static-token escape, or reverse bridge.

Every green database, volume, object store, Cognee dataset, Obot installation, LiteLLM registration,
credential, catalog, grant, agent, persona, skill, document, and artifact starts fresh. Users sign in
again, reconnect integrations, and create or publish green content through green product contracts.
Continuing external fleet and OIDC authorities are runtime dependencies, not migration sources:
green may validate their current live contracts after activation, but it does not copy legacy silo
projections, identifiers, rows, or credentials.

Legacy state has exactly two outcomes:

- **archive** — place only the approved legacy material in an encrypted, immutable, access-logged,
  owner-restricted enclave that is isolated from green networks, identities, databases, runtimes,
  deployment tooling, and application APIs. Green cannot read, mount, restore, query, or derive
  state from it. Every archive has an approved retention deadline and deletion owner;
- **drop** — revoke access and delete the state under an approved owner and evidence record.

An archive is a time-bounded custody obligation, not a delayed importer or rollback store. At its
retention trigger it is deleted. Secret values, private keys, salts, static tokens, and encryption
material are revoked and dropped rather than archived.

## Legacy-disposition ledger

The machine-readable [R0 data-disposition map](personal-agent-platform-r0-data-disposition.json)
expands this ledger across every current Prisma model, schema-history-derived retired table/column,
repository-owned CRD spec/status and PVC, and versioned upstream-store registry. Its validator must
permit only archive or drop and reject any green-readable archive, transfer path, compatibility,
legacy-store adoption, credential or identity adoption, static-token escape, or reverse bridge.
Every row remains a candidate until its required owner approval is recorded; map coverage does not
authorize archival, deletion, or R1.

| Legacy state | Required disposition | Fresh green behavior |
|--------------|----------------------|----------------------|
| Fleet/silo projections, Tenant and AccessPolicy CRDs, Postgres rows | Archive approved non-secret evidence or drop | Resolve current fleet/OIDC authority through the live target contract after activation; create new silo business state |
| Kubernetes status, workloads, routes, policies, identities, Jobs, PVCs | Archive approved operational evidence or drop | Reconcile new execution state solely from new green business authority |
| OpenClaw sessions, transcripts, tool events, schedules, uploads, generated files, workspaces, persona files | Archive or drop | Start empty Thread, Message, Run, Persona, Schedule, and Artifact authorities; users create new state |
| Company documents, grants, groups, MCP catalog/assignments, skills, budgets, model definitions, source metadata | Archive or drop | Onboard, authorize, publish, and configure each green resource afresh |
| Cognee memory and indexes | Archive the isolated legacy store or drop | Create fresh datasets; learn or ingest only from new green actions and content |
| Obot installs, volumes, catalog projections, credential custody | Archive approved non-secret audit evidence or drop | Install a fresh Obot instance and reconnect integrations into fresh custody |
| LiteLLM teams, keys, budgets, models, Redis, encrypted provider state | Archive approved non-secret audit evidence or drop; keys/salts/secrets always drop | Provision fresh teams, policy, registrations, keys, database, cache, master key, and salt |
| Skill registry/Zot bytes and PVCs | Archive or drop | Publish new SkillRevisions and bytes through the green ArtifactStore |
| Audit, trace, cost, safety, and financial evidence | Archive under the approved legal/security retention rule or drop | Start new green audit, trace, run, and cost authorities |
| SessionScope, BrokeredDevice, pairing, browser cache, OIDC process sessions | Archive named non-secret evidence or drop | Force fresh sign-in and authorize from green contracts; never reconstruct authority from legacy rows |
| Credential-bearing or restorable databases, backups, volumes, buckets, object stores, and upstream stores | Drop the complete store and every restorable copy; separately generated non-restorable deletion evidence may be archived | Provision fresh stores; no green reader, restore, schema adapter, or reference may target blue or deletion evidence |

Archive integrity evidence may record hashes, size, custody, and deletion status. It must not become
a semantic manifest, ID map, source checkpoint, or green reconstruction contract.

## Credential and reconnect ledger

| Credential class | Required action | Green rule |
|------------------|-----------------|------------|
| Human browser/OIDC session | Drop; force sign-in | Validate a fresh session against the live OIDC authority |
| Fleet/silo workload identity | Revoke blue at commit; mint distinct green identity | Prove least-privilege binding; do not copy the old subject, token, or secret |
| Provider BYOK and third-party source credential | Reconnect or recreate from fresh owner input | Create a new secret and upstream registration; do not copy old metadata or values |
| Legacy raw ProviderApiKey | Revoke and drop | Never place the value in evidence, archives, logs, or green |
| LiteLLM virtual/master keys and salt | Revoke and drop | Mint fresh keys and salt in a fresh LiteLLM store |
| Cognee identity and credential | Revoke and drop | Provision a fresh green identity and empty datasets |
| Obot static/OAuth/user credential | Revoke and drop; reconnect from fresh owner authorization | Create new green custody; legacy credential identity and key material are not adopted |
| MCP install `credentialRef` | Drop | Reinstall and authorize through green; a legacy reference proves nothing |
| Static OpenCrane API/break-glass token | Revoke and drop | Green has no static-token escape; emergency access is short-lived, IAM-backed, security-approved, and audited |
| Tenant encryption key | Revoke and drop after any approved archive is sealed | The key is never copied, mounted, or used to initialize green |
| Langfuse and optional upstream secrets | Revoke and drop | Provision fresh only when the green product explicitly enables the upstream |

No credential value is included in R0 repository evidence or a retained archive.

## Cutover lease and writer contract proposal

1. Acquire a fleet-owned lease for exactly one ClusterTenant and fence blue lifecycle, membership,
   schedules, runs, external side effects, credential changes, and public mutations.
2. If retention requires an archive, seal it in the isolated enclave and prove its hash, custody,
   green-unreadability, deadline, and deletion owner. Do not inspect it from green.
3. Confirm the separately provisioned green silo is empty, qualified, network-quarantined, and uses
   only fresh stores, identities, credentials, configuration, schemas, and protocols.
4. Before commit, an abort restores the exact signed blue deployment and reopens blue only after
   its fence and health are verified.
5. Commit atomically changes routing, active-slot ownership, and execution authority to green.
6. Revoke blue credentials and store access. Users establish fresh sessions, reconnect integrations,
   and create new green agents, personas, grants, catalogs, skills, providers, and content.
7. After green accepts writes or side effects, recovery is forward in green. Blue and its archive
   are never a writable rollback target and no reverse translator exists.
8. Delete blue and every archive at the approved per-silo retention trigger, recording deletion
   evidence through R10.

Lease duration, change-fence behavior, and operational owner remain pending approval.

## Rollback decision

Product direction recorded on 2026-07-17 is **no post-write reverse rollback**. Before commit, the
signed blue deployment may be restored as an abort. After commit, recovery is forward in green;
there is no reverse bridge, legacy write path, archive restore, or static-token escape.

Operations and program-sponsor co-approval remains pending. Implementation cannot treat the product
direction alone as complete authority for M-04.

## Cohort and maintenance proposal

Proposed order is internal/dogfood first, then the least operationally critical external silo, then
the most critical. Cohorts are ordered by blast radius and operator readiness, not by legacy data
volume or fidelity because no legacy state enters green.

Pending operating proposal: set the maximum window to four hours, measured from entering
maintenance until green commit or restored blue service. The window qualifies fencing, archive
isolation when required, routing activation, and synthetic/fresh-login verification; it contains no
export, import, conversion, or legacy-data verification threshold. No maximum has been approved.

## Ownership and approval ledger

| Responsibility | Required owner | Assignment |
|----------------|----------------|------------|
| Product contract and per-ClusterTenant archive/drop/deletion consent | Product/customer + data owner | Pending |
| Retention, archive isolation, and deletion | Legal/security/data owner | Pending |
| Forward-only post-commit recovery | Operations + program sponsor | Pending; product direction recorded |
| Credential revocation and fresh reconnect/recreation | Security/integration owner | Pending |
| Fleet lease and mutation fence | Fleet owner | Pending |
| Blue maintenance, archive sealing, and pre-commit restore | Blue operations owner | Pending |
| Green runtime/platform and fresh provisioning | Runtime/platform owners | Pending |
| Independent acceptance and commit point | Go/no-go signer, not the cutover executor | Pending |
| Budget, duplicate-stack capacity, schedule, and on-call coverage | Program sponsor | Pending |

R0 cannot close while these assignments and required co-approvals are pending.

> See also: [estate evidence index](personal-agent-platform-r0-evidence-index.md),
> [product contract](personal-agent-platform-r0-product-contract.md),
> [approval record](personal-agent-platform-r0-approval-record.md), and
> [ADR 0006](../adr/0006-rewrite-freeze-whole-silo-cutover.md).
