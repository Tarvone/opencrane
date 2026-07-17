# Personal-agent platform R0 product contract

Status: **draft for approval; not frozen**

Issue: [#252](https://github.com/italanta/opencrane/issues/252)

This document makes the R0 product decisions reviewable. Rows marked “adopted” restate accepted
architecture; rows marked “proposed” are not authorized until a named product or security owner
approves them. Green implementation must not treat a proposal as an accepted contract.

The capability boundary defines what the new product does, not what legacy state survives. Green
starts empty and receives no legacy data, state, configuration, identity or identifier, credential,
key, salt, schema, protocol, byte, or semantic decision. Legacy material is only archived in an
inert, green-unreadable enclave under an approved deadline or dropped.

## Frozen-capability candidate

| Capability | Candidate outcome | State |
|------------|-------------------|-------|
| Organization identity and membership | Use current OIDC and fleet lifecycle/membership contracts as live external authorities. Create a fresh fail-closed silo read model from post-activation authority responses; do not copy legacy silo bindings, rows, or identifiers | Adopted architecture; live freshness policy proposed below |
| Personal agent conversation | Provide streaming messages, ordered history, tool events, abort, retry/recovery, and stable thread ownership through the new Thread/Run/RunEvent contract; start with no legacy threads or history | Adopted target; exact behavioral fixtures pending R1 |
| Persona and preferences | Provide versioned PersonaRevision state created through fresh onboarding and later user edits; mutable legacy files are never read by green | Adopted target; onboarding policy proposed below |
| Personal and agent memory | Begin with empty, newly provisioned Cognee datasets; capture only new green memory with dataset identity, scope, and provenance | Adopted target |
| Company, document, and artifact knowledge | Create new canonical bytes, versions, and events through green authorities and index only that new content in Cognee | Adopted target |
| Artifacts and documents | Provide uploads, generated outputs, ownership, hashes, MIME, provenance, and conversation/run links for content created in green | Adopted target |
| Models, BYOK, and budgets | Configure provider choice, model catalog, routing, budgets, and usage afresh; create fresh LiteLLM state and credentials from new owner input | Adopted target; owner workflow pending |
| MCP integrations | Provide a new governed catalog, assignments, grants, scoped execution, and fresh Obot credential custody; every integration is installed and authorized again | Adopted target; scoped-credential acceptance pending |
| Skills | Provide new immutable skill revisions, entitlements, review, and artifact bytes; never copy Zot, registry, database, or runtime-file state | Adopted target |
| Schedules and managed runs | Provide new schedules, pause/resume, approval, retry, and exactly-once intent through green AgentRun/CronJob/Job ownership | Adopted target |
| Audit and operations | Start new immutable security/product audit evidence, run observability, backup/restore evidence, and operator controls at green activation | Adopted target; retention thresholds pending |
| Awareness rollout/participation | Remove this product surface from green; archive approved legacy evidence in isolation or drop it | Removal adopted; retention approval pending |
| Pairing, BrokeredDevice, SessionScope, gateway-admin state | Do not reconstruct green authority from these retired surfaces; archive approved non-secret evidence in isolation or drop it | Retirement adopted; retention approval pending |
| Tenant and AccessPolicy CRDs as business authority | Retire them from green business authority; archive approved blue manifests in isolation or drop them | Retirement adopted; retention approval pending |
| OpenClaw protocol, workspace, plugins, runtime state, schema, and configuration | Do not port or parse these shapes in green; archive approved blue material as opaque evidence or drop it | Non-port adopted; retention approval pending |

New blue features wait until after the green launch unless required for the R1 freeze gate or a
security/availability incident.

## Authorization proposal

Green defines authorization directly; it does not preserve or import legacy grant rows or decisions:

1. compile all applicable direct and group grants created in green;
2. choose the highest priority;
3. at equal priority, Deny wins;
4. use green timestamps only where an approved tie-break requires recency;
5. keep `project` as a separate containment dimension whose membership may span departments;
6. treat dataset-membership rows as derived green projections and create them only from green grants.

Product direction recorded on 2026-07-17: department membership neither grants nor prevents project
membership. Project grants remain explicit and combine with other green grants through the priority
and Deny-at-equal-priority rules. Required security co-approval remains pending. No legacy grant,
group, membership, subject binding, timestamp, priority, or ID enters this model.

## Membership freshness proposal

- Fleet lifecycle and membership remains a live external authority.
- A fresh silo read model records only post-activation signed authority responses; it is not seeded
  from blue databases, CRDs, archives, exports, or cached subject bindings.
- A silo may continue serving already-authorized green work during a bounded fleet outage only from
  a signed revision within the approved freshness window.
- Unknown membership, a missing current subject binding, or a revision older than the approved
  window must not authorize a new login, run, grant expansion, or cutover commit.
- Fleet read failure must not turn an unknown member into Active.

Pending operating proposal: set the maximum freshness window to five minutes from the last
successfully applied signed fleet revision. After that boundary, deny new login, new run, grant
expansion, administrative capability, capability renewal, and cutover commit. The duration and
required fleet/silo/security approvals remain unapproved.

## Persona onboarding proposal

Green never reads or reconciles legacy database documents, `SOUL.md`, `IDENTITY.md`, `USER.md`,
workspace files, or Cognee recall to initialize a persona. Every user receives a fresh default
PersonaRevision and may review, edit, or replace it through the green product. Subsequent revisions
record green provenance and remain deterministic, reviewable, and reversible.

This fresh-onboarding rule is proposed and requires product approval. It replaces the former
legacy-source precedence question; there is no persona conflict or import path to resolve.

## Retention proposal

- Legacy state is either archived as inert evidence or dropped; it is never a green authority or
  delayed initialization source.
- An archive is encrypted, immutable, access-logged, owner-restricted, protected by separate
  credentials plus network/IAM/storage isolation, green-unreadable, non-restorable into green, and
  tied to a recorded seal timestamp, a later deletion deadline, and a deletion owner.
- Green starts new transcript, tool-output, audit, artifact, persona, schedule, memory, and content
  retention clocks at activation.
- Browser caches and process sessions are dropped; users sign in again.
- Raw credentials, private keys, salts, static tokens, encryption material, and secret values are
  revoked and dropped, never archived.
- Legal/security/product owners must approve archive duration and deletion authority.

Pending operating proposal: retain an approved legacy archive for 30 days after successful green
commit, then delete after custody verification and owner sign-off, with legal hold overriding the
deadline. This does not set green product or long-term audit retention and remains unapproved.

## Acceptance proposal

Cutover qualification should require:

- 100% pass of independently authored green capability fixtures and the new green authorization
  decision table; neither may be extracted, copied, translated, or derived from blue behavior,
  frames, data, schemas, protocols, identifiers, or decisions;
- proof that every green authority was freshly initialized and contains no blue-derived record,
  byte, identifier, credential, configuration, schema, protocol, or semantic decision;
- repository, manifest, network, and runtime checks proving no importer, exporter, compatibility
  reader, blue-store reference, archive mount, static-token escape, or reverse bridge exists;
- every blue credential has a verified revoke/drop outcome and every enabled green integration has
  a distinct newly issued credential or fresh owner authorization;
- every retained archive has verified isolation, hash/custody evidence, deadline, deletion owner,
  and no green identity or network route;
- no unresolved Critical or High security finding;
- backup and restore rehearsal using green-created state only;
- activation and fresh-login verification inside the approved maintenance window;
- load, latency, availability, and cost at least as good as the measured frozen-blue baseline or an
  explicitly approved exception;
- scoped-credential MCP tests, identity isolation probes, operator rehearsal, and product UAT;
- independent go/no-go approval separate from the cutover executor.

Exact SLO thresholds, the maintenance window, and approvers remain unassigned.

## Approval ledger

| Decision | Required authority | Approval |
|----------|--------------------|----------|
| Frozen capability boundary | Product owner | Pending |
| Grant/project semantics | Product + security | Product direction recorded; security approval pending |
| Membership freshness/failure policy | Fleet + silo owners + security | Pending |
| Fresh persona onboarding | Product owner | Pending |
| Legacy archive/drop and green retention policy | Product + legal/security + data owner | Pending |
| Acceptance thresholds and go/no-go owner | Operations + security + product | Pending |

R0 cannot close while any row is pending.

> See also: [estate evidence index](personal-agent-platform-r0-evidence-index.md),
> [clean-build cutover contract](personal-agent-platform-r0-migration-contract.md), and
> [approval record](personal-agent-platform-r0-approval-record.md).
