# Personal-agent platform R0 estate evidence index

Status: **partial evidence captured 2026-07-17; estate completeness and approval pending**

Issue: [#252](https://github.com/italanta/opencrane/issues/252)

This public index records only the scope, coarse conclusions, missing evidence, and approval state
for the R0 rewrite-freeze decision test. Exact ClusterTenant identities, workload and database
counts, volume fingerprints, activity, credentials, failure state, backup/network posture, and
proprietary fleet evidence belong in an approved secured evidence system.

No such secured evidence reference is approved yet. R0 is therefore **not complete**.

## Evidence boundary

- Repository baseline: `6a01422` on `feat/agent-platform-v2-r0`.
- One configured non-production Kubernetes environment was reachable and read-only on 2026-07-17.
- One configured local test context was unreachable; no other environment was represented in the
  available kubeconfig.
- Kubernetes, Helm, CNPG, upstream database metadata, count-only SQL, and GitHub issue state were
  inspected without reading row contents or secret values.
- The live evidence is sufficient to disprove the assumption that every development ClusterTenant
  is resettable. It is not sufficient to prove estate completeness.

Missing environments are missing evidence, not proof that no other estate exists.

## Coarse live conclusions

- Multiple ClusterTenants are active in the reachable non-production environment.
- At least one ClusterTenant has meaningful agent/session state, non-reproducible memory, provider
  state, and upstream spend history. It is a **full-fidelity default** and must not be reset without
  explicit owner approval.
- At least one ClusterTenant has no UserTenant workload and is a **reset-eligible candidate**.
  Initialized upstream Obot/LiteLLM state still exists, so even this candidate requires an explicit
  owner and credential/data disposition.
- Older duplicate desired-state resources exist outside the canonical silo locations. Their
  identities and hashes must be archived in secured evidence and they must not be imported as
  additional agents.
- Silo schema, release, and image state is not yet one immutable frozen baseline. R1 must normalize,
  qualify, pin, sign, and snapshot it.
- Current backup/restore, network enforcement, credential custody, upstream exportability, and
  acceptance evidence is incomplete.

These are evidence-bounded defaults, not owner-approved classifications.

## Classification rules

A ClusterTenant is reset-eligible only when its owner approves all of the following:

- conversation history, tool output, workspace files, schedules, persona changes, artifacts, and
  personal memory may be archived or discarded;
- providers, MCP integrations, and external sources may be reconnected or rotated;
- any initialized upstream state is either proven reproducible or assigned an approved archive/drop
  disposition;
- the reset and reconnect can be rehearsed inside the approved maintenance window.

Every other ClusterTenant remains full-fidelity by default.

## Required secured evidence

The secured estate pack must contain, per ClusterTenant:

- owner, purpose, environment, member count, activity, reset/full-fidelity approval, and signatory;
- CRD, fleet revision, silo database, upstream database, state-volume, bucket, and object-store
  manifests with counts, hashes, sensitivity, provenance, and reproducibility;
- transcript, tool-output, schedule, in-flight run, upload, artifact, persona, and memory disposition;
- Cognee dataset identity/provenance/exportability;
- Obot catalog, grant, credential/OAuth custody, encryption, audit, and reconnect evidence;
- LiteLLM team/key/model/budget/spend plus salt/master-key custody and issue #174 evidence;
- skill bytes/digests/publication state and source-token reconnect requirements;
- backup, WAL, snapshot, restore, object-storage, encryption, and KMS evidence;
- maximum maintenance window, measured export/import/verification time, cohort owner, abort
  authority, commit signer, staffing, capacity, budget, and on-call coverage.

The secured system must expose a stable reference and content hash to this index without copying
tenant data or proprietary fleet logic into Git.

## Proposed cohort shape

1. Rehearse the reset factory on an owner-approved reset candidate.
2. Exercise the least-state full-fidelity cohort next, unless its owner explicitly approves reset.
3. Cut the richest full-fidelity cohort last.

This is a proposed shape, not an approved cohort list or schedule.

## R0 decision state

| Decision | State |
|----------|-------|
| Estate discovery | Partial: one non-production environment inspected; completeness unverified |
| Per-ClusterTenant classification | Evidence-bounded defaults exist only in secured working evidence; owner approval missing |
| Secured evidence reference and hash | Missing |
| Data and credential disposition | Drafted in the migration contract; owner/security approval missing |
| Product contract | Drafted; product approval missing |
| Post-write rollback | Unanswered; rewrite-freeze route remains provisional |
| Cohorts and maintenance windows | Shape proposed; identities, owners, and windows missing |
| Acceptance thresholds | Proposed; approval and measured blue baselines missing |
| Staffing, budget, schedule, sign-off authority | Unassigned |

> See also: [R0 product contract](personal-agent-platform-r0-product-contract.md) and
> [R0 migration contract](personal-agent-platform-r0-migration-contract.md).
