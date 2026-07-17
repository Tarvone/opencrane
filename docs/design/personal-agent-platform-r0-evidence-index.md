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
- The collector is only an estate-completeness, retention, and deletion-evidence tool. It does not
  authorize or support transferring any legacy material into green.
- The secured evidence prevents an undiscovered legacy store from escaping archive/drop ownership.
  It does not establish estate completeness or prove that any state is approved for archival or
  deletion.

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
unconfigured estate, inspect content or secret values, prove archive isolation or deletion, or
supply owner approvals and rollback/retention decisions. It is never an exporter, semantic
manifest, ID map, source checkpoint, green initializer, or archive reader. Those limitations are
recorded in both manifests rather than inferred from a green command exit.

## Coarse live conclusions

- Estate completeness is not proven. Every ClusterTenant remains cutover-ineligible until all of
  its legacy surfaces have an approved archive or drop outcome, deletion owner, and signatory.
- The secured evidence contains candidate dispositions and legacy-residue findings, but no archive
  or deletion is owner-approved.
- Database state, transcript/artifact/persona/memory stores, upstream provider/MCP state,
  credentials, backups, volumes, buckets, images, and release artifacts remain unproven or outside
  the collector's safe public boundary.
- Nothing in the pack is authorized to enter green. Green starts empty with fresh stores,
  identities, credentials, configuration, schemas, protocols, agents, personas, grants, catalogs,
  skills, providers, and content.

These are evidence-bounded defaults, not owner-approved archive or deletion decisions.

## Disposition rules

A ClusterTenant is cutover-eligible only when its owners approve all of the following:

- every legacy store, record class, volume, bucket, image, configuration surface, and upstream state
  has an explicit archive or drop outcome;
- every archive is encrypted, immutable, access-logged, owner-restricted, protected by separate
  credentials plus network/IAM/storage isolation, green-unreadable, non-restorable into green,
  sealed at a recorded timestamp, time-bounded after that seal, and assigned a deletion owner;
- secret values, private keys, salts, static tokens, and encryption material are revoked and dropped,
  never archived;
- providers, MCP integrations, external sources, users, personas, grants, catalogs, agents, skills,
  documents, and artifacts will be created or authorized afresh in green;
- fencing, archive-isolation confirmation when required, activation, fresh sign-in, and pre-commit
  abort are rehearsed inside the approved maintenance window.

An unclassified ClusterTenant is cutover-ineligible. No disposition authorizes transfer, import,
export, copy, semantic conversion, legacy schema/protocol parsing, ID preservation, compatibility,
archive restore, static-token escape, or reverse bridge.

## Required secured evidence

The secured estate pack must contain, per ClusterTenant:

- owner, purpose, environment, member count, activity, archive/drop/deletion consent, and signatory;
- CRD, fleet/silo database, upstream database, state-volume, bucket, object-store, image, and
  configuration inventories sufficient to prove no legacy surface was omitted;
- archive/drop decisions for transcript, tool-output, schedule, run, upload, artifact, persona,
  memory, document, grant, catalog, skill, provider, model, and audit state;
- Cognee, Obot, LiteLLM, Langfuse, skill-registry, and external-source store dispositions;
- credential revocation/drop and fresh reconnect/recreation ownership without credential values;
- archive encryption, immutability, access logging, owner restriction, separate credentials,
  network/IAM/storage isolation, seal timestamp, later retention deadline, deletion owner, and
  deletion-proof requirements;
- maximum maintenance window, cohort owner, abort authority, commit signer, staffing, capacity,
  budget, and on-call coverage.

The secured system must expose a stable reference and content hash to this index without copying
tenant data or proprietary fleet logic into Git.

## Proposed cohort shape

1. Rehearse the empty-green cutover on an internal/dogfood silo.
2. Cut the least operationally critical external silo next.
3. Cut the most critical silo last.

This is a proposed shape, not an approved cohort list or schedule.

## R0 decision state

| Decision | State |
|----------|-------|
| Estate discovery | Partial; exact source scope and reachability stay secured, and completeness is unverified |
| Per-ClusterTenant disposition | Archive/drop defaults exist; owner consent, deadlines, and deletion owners are missing |
| Secured evidence reference and hash | Temporary local pack and hashes verified; approved durable reference missing |
| Legacy state and credential disposition | Drafted in the clean-build cutover contract; owner/security approval missing |
| Product contract | Drafted; product approval missing |
| Post-write rollback | Product direction is forward-only/no reverse bridge; operations/program co-approval missing |
| Cohorts and maintenance windows | Shape proposed; identities, owners, and windows missing |
| Acceptance thresholds | Proposed; approval and measured blue baselines missing |
| Staffing, budget, schedule, sign-off authority | Unassigned |

> See also: [R0 product contract](personal-agent-platform-r0-product-contract.md),
> [R0 clean-build cutover contract](personal-agent-platform-r0-migration-contract.md), and
> [R0 approval record](personal-agent-platform-r0-approval-record.md).
