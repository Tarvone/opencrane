# Personal-agent platform R0 approval record

Status: **all decisions pending unless an approval reference is recorded below**

Issue: [#252](https://github.com/italanta/opencrane/issues/252)

This tenant-identity-free register is the public approval surface for R0. It does not copy tenant
identities, secured counts, proprietary fleet evidence, or credential details into Git. Those facts
stay in the secured evidence record referenced by hash.

The machine-checked [data-disposition map](personal-agent-platform-r0-data-disposition.json) records
candidate archive/drop outcomes for the complete current Prisma, schema-history-derived,
repository-owned CRD/PVC, and versioned upstream-store inventories. Its
`pending-owner-approval` rows remain non-authorizing inputs to M-01 and the per-ClusterTenant
archive/drop/deletion decision process.
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
| E-02 | Per-ClusterTenant archive/drop/deletion consent and signatory | Product/customer + data owner | Pending; evidence-bounded defaults stay secured and owner approval is missing | — | — | Missing |
| E-03 | Durable secured evidence reference and content hash | Security + operations owner | Pending; local ignored pack/hash verified but deletable | — | — | Missing |
| E-04 | Database, volume, object-store, upstream, credential, archive-isolation, and deletion evidence | Data + security + operations owners | Pending; complete surface inventory, archive custody/isolation, credential revocation, and deletion evidence are incomplete | — | — | Missing |

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
| P-04 | Fresh persona onboarding with no legacy source | [Persona proposal](personal-agent-platform-r0-product-contract.md#persona-onboarding-proposal) | Product owner | Pending; fresh default plus user review/edit proposed | — | — | Missing |
| P-05 | Legacy archive/drop plus green product/audit retention | [Retention proposal](personal-agent-platform-r0-product-contract.md#retention-proposal) | Product + legal/security + data owner | Pending; no general duration or deletion authority approved | — | — | Missing |
| P-06 | Acceptance SLO, load, security, disaster-recovery, operator, UAT, and go/no-go thresholds | [Acceptance proposal](personal-agent-platform-r0-product-contract.md#acceptance-proposal) | Operations + security + product | Pending; qualitative gates proposed, numeric thresholds and signer missing | — | — | Missing |

## Clean-build and cutover decisions

| ID | Decision | Contract source | Required authority | Current state | Approver | Date | Approval evidence |
|----|----------|-----------------|--------------------|---------------|----------|------|-------------------|
| M-01 | Empty green with zero legacy transfer; archive/drop only | [Clean-build rule](personal-agent-platform-r0-migration-contract.md#clean-build-rule) | Product/customer + data owner | Product direction recorded: no legacy data, state, configuration, identity/IDs, credential, key, salt, schema, protocol, byte, or semantic transfer; stable approval reference and data-owner disposition approval pending | `jrosseel` (requester) | 2026-07-17 | Missing stable reference |
| M-02 | Blue credential revocation/drop plus fresh green issuance/reconnect | [Credential ledger](personal-agent-platform-r0-migration-contract.md#credential-and-reconnect-ledger) | Security + integration owner | Pending; no legacy credential identity, value, key material, salt, or static-token escape enters green | — | — | Missing |
| M-03 | Fleet lease duration, mutation fence, and active-slot authority | [Writer contract](personal-agent-platform-r0-migration-contract.md#cutover-lease-and-writer-contract-proposal) | Fleet + operations owner | Pending | — | — | Missing |
| M-04 | Forward-only recovery after commit; no reverse rollback | [Rollback decision](personal-agent-platform-r0-migration-contract.md#rollback-decision) | Product + operations + program sponsor | Product direction recorded: pre-commit blue abort only, then forward recovery with no reverse bridge or archive restore; stable approval reference and operations/program co-approval pending | `jrosseel` (requester) | 2026-07-17 | Missing stable reference |
| M-05 | Isolated legacy-archive retention and deletion | [Retention proposal](personal-agent-platform-r0-product-contract.md#retention-proposal) | Product + legal/security + data/tenant owner | Pending; proposed 30 days after successful green commit, subject to legal hold | — | — | Missing |
| M-06 | Maximum per-tenant clean cutover window | [Cohort proposal](personal-agent-platform-r0-migration-contract.md#cohort-and-maintenance-proposal) | Product/customer + operations owner | Pending; proposed 4 hours for fencing, archive-isolation confirmation when required, activation, and fresh verification | — | — | Missing |
| M-07 | Cohort membership, blast-radius order, abort authority, and independent commit signer | [Cohort proposal](personal-agent-platform-r0-migration-contract.md#cohort-and-maintenance-proposal) | Product/customer + operations + independent signer | Pending; shape proposed, assignments missing | — | — | Missing |

## Program assignments

| ID | Decision | Required authority | Current state | Approver | Date | Approval evidence |
|----|----------|--------------------|---------------|----------|------|-------------------|
| O-01 | Fleet, blue/archive operations, green runtime/platform, security/integration, and data owners | Program sponsor | Pending | — | — | Missing |
| O-02 | Independent go/no-go signer, abort authority, and commit-point authority | Program sponsor + operations + security | Pending | — | — | Missing |
| O-03 | Budget, duplicate-stack capacity, schedule, staffing, and on-call coverage | Program sponsor | Pending | — | — | Missing |

## Recording procedure

1. Record the exact answer and exceptions in issue #252 or a signed decision record.
2. Identify the approver and confirm that person holds every required authority in the row.
3. Record the decision date and stable reference in this register; keep sensitive classifications in
   the secured evidence system and reference only their signed hash here.
4. Update the relevant product, clean-build cutover, and ADR status only after the approval is
   verifiable.
5. Close R0 only after every required row is approved and all referenced evidence verifies.

If the required M-04 co-approvers reject forward-only recovery, stop this route. A reverse event or
side-effect bridge, archive restore, or static-token escape is not part of clean green.

> See also: [estate evidence index](personal-agent-platform-r0-evidence-index.md),
> [product contract](personal-agent-platform-r0-product-contract.md),
> [clean-build cutover contract](personal-agent-platform-r0-migration-contract.md), and
> [ADR 0006](../adr/0006-rewrite-freeze-whole-silo-cutover.md).
