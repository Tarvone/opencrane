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
- Kubernetes, CNPG, upstream database metadata, and GitHub issue state were inspected without
  reading row contents or secret values. Helm release state remains intentionally unproven because
  its storage may contain Kubernetes Secrets.
- The live evidence is sufficient to disprove the assumption that every development ClusterTenant
  is resettable. It is not sufficient to prove estate completeness.

Missing environments are missing evidence, not proof that no other estate exists.

## Reproducible collection

Create the private local enclave once, then run the read-only collector into a newly named direct
child:

```bash
install -d -m 700 "$PWD/.agent-reviews"
scripts/collect-r0-estate-evidence.mjs \
  --output-dir "$PWD/.agent-reviews/new-r0-evidence-directory" \
  --allow-local-agent-reviews \
  --context approved-context-name
```

Optional metadata-only database evidence uses a preconfigured libpq service, never a connection
string:

```bash
scripts/collect-r0-estate-evidence.mjs \
  --output-dir "$PWD/.agent-reviews/new-r0-evidence-directory" \
  --allow-local-agent-reviews \
  --context approved-context-name \
  --database logical-label=approved-readonly-pgservice
```

That service must use a standalone, non-elevated evidence-reader role with no inherited memberships,
base-table access, ownership, or write privileges. The collector reads only system-catalog relation
metadata and approximate row estimates for its version-controlled table allowlist. Elevated roles,
base-table privileges, and sessions that cannot prove `transaction_read_only=on` are rejected.
Exact counts require separately provisioned, narrowly granted aggregate views or `SECURITY DEFINER`
functions; the collector never creates them and never reads a base table.

The collector requires every Kubernetes context explicitly and never changes or falls back to the
current context. It accepts only a safe-named direct child of the active worktree's pre-existing
`.agent-reviews/` directory, with explicit `--allow-local-agent-reviews` opt-in. It refuses external,
nested, primary-checkout-from-linked-worktree, existing, symbolic-link, wrong-owner,
group/world-accessible, or Git-trackable destinations.
It creates directories mode `0700` and files mode `0600`; records exact commands, timestamps,
failures, configured/reachable/unreachable contexts, and count/hash provenance; and permits only
server-returned Kubernetes metadata tables, Helm client-version inspection, and hard-coded
metadata-only `psql` operations. It never requests full Kubernetes objects, Kubernetes Secret or
ConfigMap resources, Helm release state, Helm values/manifests, row contents, logs, or events. Fields
that an approved Kubernetes printer table does not expose remain explicitly unproven.

`public-manifest.json` and its SHA-256 file are safe to reference from this index after review. The
public manifest carries the hash of `secured/file-manifest.json` but omits source counts,
reachability, failure detail, and estate-specific incompleteness. That detail and all exact context,
ClusterTenant, workload, volume, and database evidence stay below the private `secured/`
directory. Normal Git staging refuses the generated pack; never force-add it.

The ignored local pack is temporary review evidence, not a durable archive. `git clean -fdX`, worktree
deletion, or manual cleanup can remove it. Copy an approved public manifest/hash to a durable evidence
system only after review; force-adding ignored evidence is outside the collector's threat model.

The pack is deliberately marked incomplete even when every command succeeds. It cannot discover an
unconfigured estate, determine whether state is valuable or reproducible, test credential custody,
inspect transcript/artifact/memory bytes, or supply owner approvals and rollback/retention decisions.
Those limitations are recorded in both manifests rather than inferred from a green command exit.

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
