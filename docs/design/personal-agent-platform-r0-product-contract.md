# Personal-agent platform R0 product contract

Status: **draft for approval; not frozen**

Issue: [#252](https://github.com/italanta/opencrane/issues/252)

This document makes the R0 product decisions reviewable. Rows marked “adopted” restate accepted
architecture; rows marked “proposed” are not authorized until a named product or security owner
approves them. Green implementation must not treat a proposal as an accepted contract.

## Frozen-capability candidate

| Capability | Candidate outcome | State |
|------------|-------------------|-------|
| Organization identity and membership | Retain OIDC subject binding, roles, and suspension. Fleet-managed lifecycle/membership remains upstream authority with a fail-closed silo read model; per-silo OpenCrane is authoritative only for silo-owned business state | Adopted architecture; live freshness policy proposed below |
| Personal agent conversation | Retain streaming messages, ordered history, tool events, abort, retry/recovery, and stable thread ownership; replace OpenClaw protocol internals with the runtime-neutral Thread/Run/RunEvent contract | Adopted target; exact blue parity fixtures pending R1 |
| Persona and preferences | Retain persona meaning and user edits; replace mutable files as live product authority with versioned PersonaRevision state | Adopted target; conflict policy proposed below |
| Personal and agent memory | Retain non-reproducible personal/agent/org memory with dataset identity, scope, and provenance in Cognee; OpenCrane owns policy, grants, and persona authority | Adopted target; per-estate disposition pending |
| Company, document, and artifact knowledge indexes | Keep canonical bytes/versions/events in their OpenCrane authorities and rebuild Cognee indexes from them | Adopted target; blue inventory pending |
| Artifacts and documents | Retain uploads, generated outputs, ownership, hashes, MIME, provenance, and conversation/run links in canonical artifact storage | Adopted target; blue inventory pending |
| Models, BYOK, and budgets | Retain semantic provider choice, model catalog, routing defaults, budget policy, and usage evidence; recreate upstream LiteLLM state from approved authority | Adopted target; credential decisions pending |
| MCP integrations | Retain governed catalog, assignment, grants, scoped execution, and Obot as credential custodian/PEP | Adopted target; real credential custody verification pending |
| Skills | Retain immutable skill revisions, entitlements, posture, review, and artifact bytes; retire Zot/legacy registry fallbacks | Adopted target; live byte inventory pending |
| Schedules and managed runs | Retain schedules, pause/resume, approval, retry, and exactly-once intent through green AgentRun/CronJob/Job ownership | Adopted target; live schedule inventory pending |
| Audit and operations | Retain immutable security/product audit evidence, run observability, backup/restore evidence, and operator controls | Adopted target; retention thresholds pending |
| Awareness rollout/participation | Remove the compatibility product surface from green; archive/drop scope remains an R0 retention decision | Removal adopted; archive/drop proposed and pending |
| Pairing, BrokeredDevice, SessionScope, gateway-admin state | Do not reconstruct green authority from these retired surfaces; archive/drop scope remains an R0 retention decision | Retirement adopted; archive/drop proposed and pending |
| Tenant and AccessPolicy CRDs as business authority | Retire them from green business authority while Kubernetes remains execution state; exact export/archive scope remains an R0 decision | Retirement adopted; export/archive proposed and pending |
| OpenClaw protocol, workspace compatibility, plugins, and runtime state shape | Do not port these shapes into green; exact semantic/byte import scope remains an R0 decision | Non-port adopted; import scope proposed and pending |

New blue features wait until after the green launch unless they are required to meet the R1 freeze
gate or address a security/availability incident.

## Authorization proposal

Until product and security owners approve a replacement rule, migration must preserve the current
effective semantics:

1. compile all applicable direct and group grants;
2. choose the highest priority;
3. at equal priority, Deny wins;
4. preserve timestamps when the existing tie-break depends on recency;
5. keep `project` as an explicit scope vocabulary value and dataset-mapping input; do not silently
   collapse it into team, department, or organization;
6. treat dataset-membership rows as derived projections and rebuild them from approved grants.

Open question: whether project becomes a hierarchy tier, an ordinary label/group, or a separate
containment dimension. Raw-row migration without this decision is not semantic parity.

## Membership freshness proposal

- Fleet lifecycle and membership revision remains upstream authority.
- A silo may continue serving already-authorized work during a bounded fleet outage only from a
  signed/captured revision within the approved freshness window.
- Unknown membership status, a missing subject binding, or a revision older than the approved
  window must not authorize a new login, new run, grant expansion, or cutover commit.
- Fleet read failure must not turn an unknown member into Active.
- The cutover captures one fleet revision, leases the ClusterTenant, and queues later mutations for
  replay after commit or abort.

The maximum freshness window and queued-mutation owner are unapproved.

## Persona precedence proposal

R0 should not declare either the database or mutable workspace files universally authoritative.
For each full-fidelity UserTenant:

1. freeze and hash the database workspace documents and the live `SOUL.md`, `IDENTITY.md`, and
   `USER.md` files;
2. if both match their last managed baseline, import the approved database version;
3. if only the live file changed, import it as a user-authored PersonaRevision with provenance;
4. if both changed, block that UserTenant's import until an owner resolves the conflict;
5. never use Cognee recall or a delivery-version marker as proof of persona equality.

This conflict-blocking rule is proposed and requires product approval.

## Retention proposal

- Full-fidelity defaults preserve transcripts, tool events, artifacts, uploads, persona, schedules,
  unresolved approvals, user-authored memory, credential/reconnect evidence, and security audit.
- Reproducible projections and indexes are rebuilt, not migrated as authority.
- Reset candidates are snapshotted and archived before deletion until their owner approves a shorter
  retention period.
- Browser caches and ephemeral sessions are dropped; users sign in and reconnect to green.
- No raw credential or secret value enters an exporter bundle, Git, logs, or audit metadata.
- Legal/security/product owners must approve retention duration and deletion authority.

## Acceptance proposal

Cutover qualification should require:

- 100% pass of the frozen capability fixtures and authorization decision table;
- a complete manifest for every migrated byte/record, with hashes and zero unexplained orphans;
- every credential proven adopted/rotated or assigned to an owner-approved reconnect action;
- no unresolved Critical or High security finding;
- backup and restore rehearsal from immutable evidence;
- measured import plus verification within half the approved maintenance window;
- load, latency, availability, and cost at least as good as the measured frozen-blue baseline or an
  explicitly approved exception;
- scoped-credential MCP tests, identity isolation probes, operator rehearsal, and product UAT;
- independent go/no-go approval separate from the migration executor.

Exact SLO thresholds, the maintenance window, and approvers remain unassigned.

## Approval ledger

| Decision | Required authority | Approval |
|----------|--------------------|----------|
| Frozen capability boundary | Product owner | Pending |
| Grant/project semantics | Product + security | Pending |
| Membership freshness/failure policy | Fleet + silo owners + security | Pending |
| Persona conflict policy | Product + data owner | Pending |
| Retention and deletion policy | Product + legal/security | Pending |
| Acceptance thresholds and go/no-go owner | Operations + security + product | Pending |

R0 cannot close while any row is pending.

> See also: [estate evidence index](personal-agent-platform-r0-evidence-index.md) and
> [migration contract](personal-agent-platform-r0-migration-contract.md).
