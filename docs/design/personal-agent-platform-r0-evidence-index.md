# Personal-agent platform R0 estate evidence index

Status: **partial evidence captured 2026-07-17; estate completeness and approval pending**

Issue: [#252](https://github.com/italanta/opencrane/issues/252)

This public index records only the non-sensitive boundary, manifest hashes, generic incompleteness,
and approval state for the R0 rewrite-freeze decision test. Source scopes, counts, reachability,
failures, exact ClusterTenant identities, topology, classifications, activity, credentials,
backup/network posture, and proprietary fleet evidence stay in private evidence.

A reviewed local pack now provides a temporary secured reference, but it is ignored, worktree-local,
and deletable. No durable secured evidence reference is approved yet. R0 is therefore **not
complete**.

## Evidence boundary

- Repository baseline: clean revision `71a988a163edd61a071a61c67241f33781cddfb9` on
  `feat/agent-platform-v2-r0`.
- The collector operated only on explicitly requested sources and retained their scope,
  reachability, failures, counts, and topology below the secured manifest hash.
- The collector never requested full Kubernetes objects, row contents, secret values, ConfigMaps,
  logs, events, or Helm release state.
- The secured evidence prevents treating reset eligibility as an estate-wide assumption. It does
  not establish estate completeness or prove that any stored state is valuable, reproducible, or
  safe to discard.

Missing environments are missing evidence, not proof that no other estate exists.

## Verified local evidence pack

| Field | Verified value |
|-------|----------------|
| Local reference | `.agent-reviews/r0-estate-20260717T095021Z/` |
| Source revision | `71a988a163edd61a071a61c67241f33781cddfb9`, clean |
| Public manifest SHA-256 | `2ccd613d774dc7377d970f6f8903a4c4fc54e4b811da3992986d9e304abd1bb8` |
| Secured file-manifest SHA-256 | `fbafdda39cb22ec275c5b730e494fe56beae904d797067c7b64c1a6e5fb5b46f` |
| Publication marker | `.complete` present; `.partial` absent |
| Evidence completeness | `incomplete` |

All secured manifest entries matched their recorded hashes, sizes, and private modes at review time.
These checks establish pack integrity, not estate completeness. The reference becomes invalid if
the ignored directory is removed, the worktree is deleted, or `git clean -fdX` runs.

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

- Reset eligibility is not proven for the estate. Every unclassified ClusterTenant remains
  cutover-ineligible until its owner approves a reset or full-fidelity disposition.
- The secured evidence contains candidate classifications and legacy-residue findings, but no
  classification or deletion is owner-approved.
- Database state, transcript/artifact/persona/memory bytes, upstream provider/MCP state, credential
  custody, backup/restore, image digests, release baselines, and acceptance evidence remain
  unproven or outside the collector's safe public boundary.

These are evidence-bounded defaults, not owner-approved classifications.

## Classification rules

A ClusterTenant is reset-eligible only when its owner approves all of the following:

- conversation history, tool output, workspace files, schedules, persona changes, artifacts, and
  personal memory may be archived or discarded;
- providers, MCP integrations, and external sources may be reconnected or rotated;
- any initialized upstream state is either proven reproducible or assigned an approved archive/drop
  disposition;
- the reset and reconnect can be rehearsed inside the approved maintenance window.

An unclassified ClusterTenant is cutover-ineligible. A full-fidelity classification authorizes only
the smallest one-way semantic import of explicitly approved non-reproducible data into green
authorities; it never authorizes a compatibility layer, legacy runtime shape, or raw database copy.

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
| Estate discovery | Partial; exact source scope and reachability stay secured, and completeness is unverified |
| Per-ClusterTenant classification | Secured evidence-bounded defaults exist; owner approvals stay secured and are missing |
| Secured evidence reference and hash | Temporary local pack and hashes verified; approved durable reference missing |
| Data and credential disposition | Drafted in the migration contract; owner/security approval missing |
| Product contract | Drafted; product approval missing |
| Post-write rollback | Unanswered; rewrite-freeze route remains provisional |
| Cohorts and maintenance windows | Shape proposed; identities, owners, and windows missing |
| Acceptance thresholds | Proposed; approval and measured blue baselines missing |
| Staffing, budget, schedule, sign-off authority | Unassigned |

> See also: [R0 product contract](personal-agent-platform-r0-product-contract.md),
> [R0 migration contract](personal-agent-platform-r0-migration-contract.md), and
> [R0 approval record](personal-agent-platform-r0-approval-record.md).
