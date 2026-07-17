# Personal-agent platform R0 approval record

Status: **all decisions pending unless an approval reference is recorded below**

Issue: [#252](https://github.com/italanta/opencrane/issues/252)

This tenant-identity-free register is the public approval surface for R0. It does not copy tenant
identities, secured counts, proprietary fleet evidence, or credential details into Git. Those facts
stay in the secured evidence record referenced by hash.

The machine-checked [data-disposition map](personal-agent-platform-r0-data-disposition.json) records
candidate outcomes for the complete current Prisma, migration-derived historical, repository-owned
CRD/PVC, and versioned upstream-store inventories. Its `pending-owner-approval` rows remain
non-authorizing inputs to M-01 and the per-ClusterTenant decision process.
The map deliberately requires the union of product/customer, data, legal/security, fleet,
operations, and integration authority before any row can become `approved`; this conservative R0
policy prevents a generic dataset approval from bypassing the source-specific owner registers below.

An approval is valid only when its row records the exact decision, a named approver with the required
authority, an ISO date, and a stable approval reference such as an issue comment or signed decision
record. A contract-level “yes” does not fill a duration, owner, threshold, tenant classification, or
exception that is not explicitly stated. `Pending` is fail-closed and cannot authorize R1.

## Evidence register

| ID | Decision | Required authority | Current state | Approver | Date | Approval evidence |
|----|----------|--------------------|---------------|----------|------|-------------------|
| E-01 | Complete estate boundary and configured/unconfigured environment inventory | Fleet + operations owners | Pending; temporary local evidence is incomplete and exact scope stays secured | — | — | Missing |
| E-02 | Per-ClusterTenant reset-eligible/full-fidelity classification and signatory | Product/customer + data owner | Pending; evidence-bounded defaults stay secured and owner approval is missing | — | — | Missing |
| E-03 | Durable secured evidence reference and content hash | Security + operations owner | Pending; local ignored pack/hash verified but deletable | — | — | Missing |
| E-04 | Database, volume, object-store, upstream, credential, backup, and restore evidence | Data + security + operations owners | Pending; required semantic, byte, custody, and restore evidence is incomplete | — | — | Missing |

Temporary local reference: `.agent-reviews/r0-estate-20260717T095021Z/` at clean revision
`71a988a163edd61a071a61c67241f33781cddfb9`. Public manifest SHA-256:
`2ccd613d774dc7377d970f6f8903a4c4fc54e4b811da3992986d9e304abd1bb8`. Secured file-manifest
SHA-256: `fbafdda39cb22ec275c5b730e494fe56beae904d797067c7b64c1a6e5fb5b46f`.

## Product decisions

| ID | Decision | Contract source | Required authority | Current state | Approver | Date | Approval evidence |
|----|----------|-----------------|--------------------|---------------|----------|------|-------------------|
| P-01 | Frozen capability boundary | [Capability candidate](personal-agent-platform-r0-product-contract.md#frozen-capability-candidate) | Product owner | Pending; proposed `Yes` | — | — | Missing |
| P-02 | Grant Deny/priority/timestamp semantics and permanent `project` scope model | [Authorization proposal](personal-agent-platform-r0-product-contract.md#authorization-proposal) | Product + security | Product direction recorded: separate cross-department dimension; security approval pending | `jrosseel` (requester) | 2026-07-17 | [Issue comment](https://github.com/italanta/opencrane/issues/252#issuecomment-5001953203) |
| P-03 | Membership freshness and failure behavior | [Membership proposal](personal-agent-platform-r0-product-contract.md#membership-freshness-proposal) | Fleet + silo owners + security | Pending; proposed maximum is 5 minutes from the last signed applied revision | — | — | Missing |
| P-04 | Persona conflict precedence | [Persona proposal](personal-agent-platform-r0-product-contract.md#persona-precedence-proposal) | Product + data owner | Pending; conflict-blocking rule proposed | — | — | Missing |
| P-05 | Full-fidelity transcript, tool-output, audit, artifact, memory, and deletion retention | [Retention proposal](personal-agent-platform-r0-product-contract.md#retention-proposal) | Product + legal/security | Pending; no general duration or deletion authority approved | — | — | Missing |
| P-06 | Acceptance SLO, load, security, disaster-recovery, operator, UAT, and go/no-go thresholds | [Acceptance proposal](personal-agent-platform-r0-product-contract.md#acceptance-proposal) | Operations + security + product | Pending; qualitative gates proposed, numeric thresholds and signer missing | — | — | Missing |

## Migration and cutover decisions

| ID | Decision | Contract source | Required authority | Current state | Approver | Date | Approval evidence |
|----|----------|-----------------|--------------------|---------------|----------|------|-------------------|
| M-01 | Clean-slate green plus semantic migrate/rebuild/archive/drop defaults and per-dataset exceptions | [Clean-green rule](personal-agent-platform-r0-migration-contract.md#clean-green-rule) | Product/customer + data owner | Product direction recorded: no compatibility; only minimal one-way semantic import where approved; data-owner disposition pending | `jrosseel` (requester) | 2026-07-17 | [Issue comment](https://github.com/italanta/opencrane/issues/252#issuecomment-5001980699) |
| M-02 | Credential rotation, recreation, reconnect, and revocation defaults | [Credential ledger](personal-agent-platform-r0-migration-contract.md#credential-and-reconnect-ledger) | Security + integration owner | Pending; legacy credential identity and key material are never adopted | — | — | Missing |
| M-03 | Fleet lease duration, captured revision, queued mutations, and queue authority | [Writer contract](personal-agent-platform-r0-migration-contract.md#cutover-lease-and-writer-contract-proposal) | Fleet + operations owner | Pending | — | — | Missing |
| M-04 | Post-write reverse rollback requirement | [Rollback decision](personal-agent-platform-r0-migration-contract.md#rollback-decision) | Product + operations + program sponsor | Pending; `Yes` stops rewrite-freeze and requires a separately planned strangler/hybrid route | — | — | Missing |
| M-05 | Reset-candidate archive retention | [Retention proposal](personal-agent-platform-r0-product-contract.md#retention-proposal) | Product + legal/security + tenant owner | Pending; proposed 30 days after successful green commit, subject to legal hold | — | — | Missing |
| M-06 | Maximum per-tenant maintenance window and qualification threshold | [Cohort proposal](personal-agent-platform-r0-migration-contract.md#cohort-and-maintenance-proposal) | Product/customer + operations owner | Pending; proposed 4 hours, with import plus verification at most 2 hours | — | — | Missing |
| M-07 | Cohort membership, order, abort authority, and independent commit signer | [Cohort proposal](personal-agent-platform-r0-migration-contract.md#cohort-and-maintenance-proposal) | Product/customer + operations + independent signer | Pending; shape proposed, assignments missing | — | — | Missing |

## Program assignments

| ID | Decision | Required authority | Current state | Approver | Date | Approval evidence |
|----|----------|--------------------|---------------|----------|------|-------------------|
| O-01 | Fleet, migration, blue operations, green runtime/platform, security/integration, and data owners | Program sponsor | Pending | — | — | Missing |
| O-02 | Independent go/no-go signer, abort authority, and commit-point authority | Program sponsor + operations + security | Pending | — | — | Missing |
| O-03 | Budget, duplicate-stack capacity, schedule, staffing, and on-call coverage | Program sponsor | Pending | — | — | Missing |

## Recording procedure

1. Record the exact answer and exceptions in issue #252 or a signed decision record.
2. Identify the approver and confirm that person holds every required authority in the row.
3. Record the decision date and stable reference in this register; keep sensitive classifications in
   the secured evidence system and reference only their signed hash here.
4. Update the relevant product, migration, and ADR status only after the approval is verifiable.
5. Close R0 only after every required row is approved and all referenced evidence verifies.

If M-04 requires post-write reverse rollback, stop this route and return to the strangler/hybrid
plan. A reverse event or side-effect bridge is not part of clean green.

> See also: [estate evidence index](personal-agent-platform-r0-evidence-index.md),
> [product contract](personal-agent-platform-r0-product-contract.md),
> [migration contract](personal-agent-platform-r0-migration-contract.md), and
> [ADR 0006](../adr/0006-rewrite-freeze-whole-silo-cutover.md).
