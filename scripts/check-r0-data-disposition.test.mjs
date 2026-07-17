#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { _ReadHistoricalInventory, _ReadPrismaInventory, _ReadRepositoryStateInventory, _RepositoryStateId, _ValidateDispositionMap } from "./check-r0-data-disposition.mjs";

const _root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const _map = JSON.parse(readFileSync(join(_root, "docs/design/personal-agent-platform-r0-data-disposition.json"), "utf8"));
const _inventory = _ReadPrismaInventory();
const _approvalEvidence = {
  approver: "owner",
  authorities: ["data-owner", "fleet-owner", "integration-owner", "legal-security-owner", "operations-owner", "product-customer-owner"],
  date: "2026-07-17",
  reference: "decision:1",
};

/** Return a deep mutable copy of the checked-in map. */
function _copyMap()
{
  return structuredClone(_map);
}

test("checked-in R0 disposition map covers the current estate", function _valid()
{
  const result = _ValidateDispositionMap(_copyMap(), _inventory);
  assert.equal(result.prismaModels, _inventory.size);
  assert.equal(result.datasets, result.prismaModels + result.historicalStates + result.repositoryStates + result.estateClasses);
  assert.deepEqual([...new Set(_map.datasets.map(function _disposition(entry) { return entry.disposition; }))].sort(), ["archive", "drop"]);
});

test("a newly unclassified Prisma model fails closed", function _missingModel()
{
  const map = _copyMap();
  const index = map.datasets.findIndex(function _tenant(entry) { return entry.id === "prisma:Tenant"; });
  map.datasets.splice(index, 1);
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /unclassified Prisma models: Tenant/u);
});

test("duplicate model coverage fails closed", function _duplicateModel()
{
  const map = _copyMap();
  const original = map.datasets.find(function _tenant(entry) { return entry.id === "prisma:Tenant"; });
  map.datasets.push(structuredClone(original));
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /dataset prisma:Tenant is duplicated/u);
});

test("duplicate dataset ids fail closed", function _duplicateId()
{
  const map = _copyMap();
  map.datasets.push(structuredClone(map.datasets[0]));
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /dataset prisma:AccessToken is duplicated/u);
});

test("unknown model coverage fails closed", function _unknownModel()
{
  const map = _copyMap();
  const original = map.datasets.find(function _tenant(entry) { return entry.id === "prisma:Tenant"; });
  original.source.model = "RetiredTenant";
  original.id = "prisma:RetiredTenant";
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /unclassified Prisma models: Tenant/u);
});

test("stable ids are bound to source identity", function _sourceIdentity()
{
  const map = _copyMap();
  const tenant = map.datasets.find(function _tenant(entry) { return entry.id === "prisma:Tenant"; });
  tenant.id = "estate:Tenant";
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /does not match its Prisma source identity/u);
});

test("repository-state ids are derived from the exact source coordinate", function _repositorySourceIdentity()
{
  const map = _copyMap();
  const repositoryState = map.datasets.find(function _repository(entry) { return entry.source.kind === "repository-state"; });
  repositoryState.id = _RepositoryStateId(`${repositoryState.source.key}-renamed`);
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /does not match its repository source identity/u);
});

test("compatibility is never an allowed cutover posture", function _compatibility()
{
  const map = _copyMap();
  map.cleanGreen.compatibilityAllowed = true;
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /compatibilityAllowed must be false/u);
});

test("unknown dispositions fail closed", function _disposition()
{
  const map = _copyMap();
  map.datasets[0].disposition = "carry-forward";
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /invalid disposition/u);
});

test("dual paths and legacy store adoption are never allowed", function _legacyAdoption()
{
  const map = _copyMap();
  map.cleanGreen.dualPathAllowed = true;
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /dualPathAllowed must be false/u);
});

test("legacy credential and identity adoption are never allowed", function _credentialAdoption()
{
  const map = _copyMap();
  map.cleanGreen.legacyCredentialAdoptionAllowed = true;
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /legacyCredentialAdoptionAllowed must be false/u);
});

test("green always starts empty", function _emptyGreen()
{
  const map = _copyMap();
  map.cleanGreen.greenInitialState = "seeded";
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /greenInitialState must be empty/u);
});

test("every legacy transfer class remains forbidden", function _legacyTransfer()
{
  for (const flag of ["legacyDataTransferAllowed", "legacyStateTransferAllowed", "legacyConfigTransferAllowed",
    "legacyIdentityTransferAllowed", "legacyIdentifierTransferAllowed", "legacyCredentialTransferAllowed",
    "legacyKeyTransferAllowed", "legacySaltTransferAllowed", "legacySchemaTransferAllowed",
    "legacyProtocolTransferAllowed", "legacyArtifactTransferAllowed", "legacyByteTransferAllowed",
    "legacySemanticTransferAllowed", "legacyOtherValueTransferAllowed"])
  {
    const map = _copyMap();
    map.cleanGreen[flag] = true;
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, new RegExp(`${flag} must be false`, "u"));
  }
});

test("static-token escape and ad-hoc clean-green exceptions fail closed", function _cleanGreenShape()
{
  const tokenMap = _copyMap();
  tokenMap.cleanGreen.staticTokenEscapeAllowed = true;
  assert.throws(function _validate() { _ValidateDispositionMap(tokenMap, _inventory); }, /staticTokenEscapeAllowed must be false/u);
  const extraMap = _copyMap();
  extraMap.cleanGreen.temporaryTransferExceptionAllowed = false;
  assert.throws(function _validate() { _ValidateDispositionMap(extraMap, _inventory); }, /only the canonical empty-green invariants/u);
});

test("migrate and rebuild dispositions fail closed", function _legacyDispositions()
{
  for (const disposition of ["migrate", "rebuild"])
  {
    const map = _copyMap();
    map.datasets[0].disposition = disposition;
    map.datasets[0].lifecyclePolicy = disposition;
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /invalid disposition/u);
  }
});

test("migrate and rebuild lifecycle policies fail closed", function _legacyLifecyclePolicies()
{
  for (const disposition of ["migrate", "rebuild"])
  {
    const map = _copyMap();
    map.lifecyclePolicies[disposition] = {};
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /lifecyclePolicies must contain only archive and drop/u);
  }
});

test("nested lifecycle and dataset exceptions fail closed", function _nestedExceptions()
{
  const lifecycleMap = _copyMap();
  lifecycleMap.lifecyclePolicies.archive.restoreAllowed = true;
  assert.throws(function _validate() { _ValidateDispositionMap(lifecycleMap, _inventory); }, /archive lifecycle policy must enforce every custody control/u);

  for (const field of ["greenSeedFromBlue", "migrationAllowed", "reverseBridgeAllowed"])
  {
    const map = _copyMap();
    map.datasets[0][field] = true;
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /must contain only canonical disposition fields/u);
  }

  const sourceMap = _copyMap();
  sourceMap.datasets[0].source.legacyTable = "access_tokens";
  assert.throws(function _validate() { _ValidateDispositionMap(sourceMap, _inventory); }, /non-canonical Prisma source fields/u);
});

test("every dataset independently forbids legacy input", function _datasetLegacyInput()
{
  assert.equal(_map.datasets.every(function _forbidden(dataset) { return dataset.legacyInputAllowed === false; }), true);
  const map = _copyMap();
  map.datasets[0].legacyInputAllowed = true;
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /must forbid every legacy input/u);
});

test("credential and restorable store datasets are drop only", function _dropOnly()
{
  for (const id of [
    "prisma:McpServerCredential", "prisma:McpServerInstall", "prisma:ProviderApiKey",
    "prisma:ProviderCredential", "prisma:SessionScope", "estate:backup-and-restore-sets",
    "estate:obot-managed-mcp-volumes", "estate:opencrane-cnpg-database",
    "estate:repository-abb08074718bfb86", "estate:usertenant-gcs-state",
  ])
  {
    const checkedIn = _map.datasets.find(function _id(dataset) { return dataset.id === id; });
    assert.equal(checkedIn.disposition, "drop", id);
    const map = _copyMap();
    const dataset = map.datasets.find(function _id(entry) { return entry.id === id; });
    dataset.disposition = "archive";
    dataset.lifecyclePolicy = "archive";
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /contains credential or restorable store state and must be dropped/u);
  }
});

test("archive state is isolated from green", function _archiveIsolation()
{
  for (const field of ["runtimeReachable", "greenReadable", "mounted", "restorableIntoGreen"])
  {
    const map = _copyMap();
    map.lifecyclePolicies.archive[field] = true;
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /archive lifecycle policy must enforce every custody control/u);
  }
  for (const field of ["accessLogging", "encryption", "iamIsolation", "immutability", "isolation",
    "networkIsolation", "ownerRestriction", "sealTimestamp", "separateCredentials", "storageIsolation"])
  {
    const map = _copyMap();
    map.lifecyclePolicies.archive[field] = "optional";
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /archive lifecycle policy must enforce every custody control/u);
  }
});

test("archive can never become a permanent record", function _permanentArchive()
{
  const map = _copyMap();
  map.lifecyclePolicies.archive.terminalAction = "permanent-record";
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /archive lifecycle policy must enforce every custody control/u);
});

test("migration and rebuild fields are forbidden on every dataset", function _legacyFields()
{
  for (const field of ["migrationMode", "sourceReproducibility", "rebuildSource"])
  {
    const map = _copyMap();
    map.datasets[0][field] = "legacy-input";
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, new RegExp(`must not declare ${field}`, "u"));
  }
});

test("approved rows require durable evidence", function _approvalEvidence()
{
  const map = _copyMap();
  map.datasets[0].approval = "approved";
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /lacks approvalEvidence/u);
});

test("approval evidence must satisfy every required authority", function _approvalAuthority()
{
  const map = _copyMap();
  map.datasets[0].approval = "approved";
  map.datasets[0].approvalEvidence = { approver: "owner", authorities: ["data-owner"], date: "2026-07-17", reference: "decision:1" };
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /lacks one or more required authorities/u);
});

test("approval evidence requires a real calendar date", function _approvalDate()
{
  const map = _copyMap();
  map.datasets[0].approval = "approved";
  map.datasets[0].approvalEvidence = {
    ...structuredClone(_approvalEvidence),
    date: "2026-02-31",
  };
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /lacks a valid ISO approval date/u);
});

test("approved rows require disposition-specific lifecycle evidence", function _approvedLifecycle()
{
  const expectations = new Map([
    ["archive", /lacks lifecycleEvidence/u],
    ["drop", /lacks lifecycleEvidence/u],
  ]);
  for (const [disposition, expected] of expectations)
  {
    const map = _copyMap();
    const dataset = map.datasets.find(function _disposition(entry) { return entry.disposition === disposition; });
    dataset.approval = "approved";
    dataset.approvalEvidence = structuredClone(_approvalEvidence);
    assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, expected);
  }
});

test("approved archive evidence is isolated and time bounded", function _archiveEvidence()
{
  const map = _copyMap();
  const dataset = map.datasets.find(function _archive(entry) { return entry.disposition === "archive"; });
  dataset.approval = "approved";
  dataset.approvalEvidence = structuredClone(_approvalEvidence);
  dataset.lifecycleEvidence = {
    accessLogReference: "evidence:access-log",
    archiveSealedAt: "2026-07-17T12:00:00.000Z",
    credentialIsolationReference: "evidence:credentials",
    fixedDeletionDate: "2026-08-17",
    deletionOwner: "deletion-owner",
    encryptionReference: "evidence:encryption",
    iamIsolationReference: "evidence:iam",
    immutabilityReference: "evidence:immutability",
    isolationReference: "archive:1",
    networkIsolationReference: "evidence:network",
    ownerRestrictionReference: "evidence:owner",
    runtimeReachable: false,
    greenReadable: false,
    mounted: false,
    restorableIntoGreen: false,
    removalGate: "R10",
    storageIsolationReference: "evidence:storage",
    terminalAction: "drop",
  };
  assert.doesNotThrow(function _validate() { _ValidateDispositionMap(map, _inventory); });
  for (const field of ["accessLogReference", "credentialIsolationReference", "encryptionReference",
    "iamIsolationReference", "immutabilityReference", "isolationReference",
    "networkIsolationReference", "ownerRestrictionReference", "storageIsolationReference"])
  {
    const missingControl = structuredClone(map);
    delete missingControl.datasets.find(function _id(entry) { return entry.id === dataset.id; }).lifecycleEvidence[field];
    assert.throws(function _validate() { _ValidateDispositionMap(missingControl, _inventory); }, /non-canonical lifecycle evidence/u);
  }
  dataset.lifecycleEvidence.fixedDeletionDate = "retained-forever";
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /lacks concrete isolation, fixed deletion, and terminal drop evidence/u);
});

test("archive deletion deadline follows the archive seal", function _archiveDeadlineOrder()
{
  const map = _copyMap();
  const dataset = map.datasets.find(function _archive(entry) { return entry.disposition === "archive"; });
  dataset.approval = "approved";
  dataset.approvalEvidence = structuredClone(_approvalEvidence);
  dataset.lifecycleEvidence = {
    accessLogReference: "evidence:access-log",
    archiveSealedAt: "2026-07-17T12:00:00.000Z",
    credentialIsolationReference: "evidence:credentials",
    fixedDeletionDate: "2020-01-01",
    deletionOwner: "deletion-owner",
    encryptionReference: "evidence:encryption",
    iamIsolationReference: "evidence:iam",
    immutabilityReference: "evidence:immutability",
    isolationReference: "archive:1",
    networkIsolationReference: "evidence:network",
    ownerRestrictionReference: "evidence:owner",
    runtimeReachable: false,
    greenReadable: false,
    mounted: false,
    restorableIntoGreen: false,
    removalGate: "R10",
    storageIsolationReference: "evidence:storage",
    terminalAction: "drop",
  };
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /lacks concrete isolation, fixed deletion, and terminal drop evidence/u);
});

test("known historical state cannot silently disappear", function _historicalCoverage()
{
  const map = _copyMap();
  const index = map.datasets.findIndex(function _historical(entry) { return entry.id === "historical:brokered_devices"; });
  map.datasets.splice(index, 1);
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /unclassified required historical states: brokered_devices/u);
});

test("a newly discovered historical residue fails closed", function _newHistoricalState()
{
  const historical = new Set(_ReadHistoricalInventory());
  historical.add("future_retired_table");
  assert.throws(function _validate() { _ValidateDispositionMap(_copyMap(), _inventory, historical); }, /unclassified required historical states: future_retired_table/u);
});

test("a newly discovered repository CRD or PVC fails closed", function _newRepositoryState()
{
  const repositoryState = new Set(_ReadRepositoryStateInventory());
  repositoryState.add("apps/example/templates/new-state.yaml#persistent-data");
  assert.throws(function _validate() {
    _ValidateDispositionMap(_copyMap(), _inventory, _ReadHistoricalInventory(), repositoryState);
  }, /unclassified repository states/u);
});

test("multiple resources in one file receive distinct source coordinates", function _multipleRepositoryStates()
{
  const fixtureRoot = mkdtempSync(join(tmpdir(), "opencrane-r0-state-"));
  try
  {
    const templates = join(fixtureRoot, "apps/example/templates");
    mkdirSync(templates, { recursive: true });
    writeFileSync(join(templates, "state.yaml"), [
      "kind: PersistentVolumeClaim",
      "metadata:",
      "  name: first-pvc",
      "---",
      "kind: PersistentVolumeClaim",
      "metadata:",
      "  name: second-pvc",
      "---",
      "kind: CustomResourceDefinition",
      "metadata:",
      "  name: first.example.test",
      "---",
      "kind: CustomResourceDefinition",
      "metadata:",
      "  name: second.example.test",
    ].join("\n"));
    const inventory = _ReadRepositoryStateInventory(fixtureRoot);
    assert.equal(inventory.size, 6);
    assert.equal([...inventory].filter(function _crd(key) { return key.includes("#crd-"); }).length, 4);
    assert.equal([...inventory].filter(function _pvc(key) { return key.includes("#pvc-"); }).length, 2);
  }
  finally
  {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("required external estate classes cannot silently disappear", function _estateCoverage()
{
  const map = _copyMap();
  const index = map.datasets.findIndex(function _estate(entry) { return entry.id === "estate:openclaw-runtime-history"; });
  map.datasets.splice(index, 1);
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /unclassified required estate classes: openclaw-runtime-history/u);
});

test("active clean-green contracts never regress to legacy adoption", function _architectureWording()
{
  const architecture = readFileSync(join(_root, "docs/design/personal-agent-platform-architecture.md"), "utf8");
  assert.doesNotMatch(architecture, /OpenClaw compatibility adapter during migration/u);
  assert.match(architecture, /OpenClaw never enters green/u);
  const loopPlan = readFileSync(join(_root, "docs/design/openclaw-agent-loop-replacement-plan.md"), "utf8");
  assert.doesNotMatch(loopPlan, /### L2 — bridge OpenClaw into the canonical plane/u);
  assert.match(loopPlan, /L2 — superseded bridge \(strangler route only; do not execute under rewrite-freeze\)/u);
  assert.doesNotMatch(loopPlan, /unless a reverse migration is executed/u);
  assert.doesNotMatch(loopPlan, /behavioral parity|black-box trajectory recorder|production-shaped turns|Use only as a behavioral oracle/iu);
  assert.match(loopPlan, /OpenClaw behavior is not a\s+compatibility target, fixture source, oracle, or acceptance baseline/iu);
  assert.doesNotMatch(loopPlan, /fixtures must target the deployed pinned\s+artifact/iu);
  const runtimeAdr = readFileSync(join(_root, "docs/adr/0005-opencrane-owned-agent-runtime.md"), "utf8");
  assert.doesNotMatch(runtimeAdr, /behavioral oracle|frozen trajectories|exact pinned blue behavior/iu);
  assert.match(runtimeAdr, /not a green dependency, fixture source, behavior oracle, or conformance baseline/iu);
  assert.doesNotMatch(architecture, /frozen-trajectory/iu);
  const executionPlan = readFileSync(join(_root, "plan.md"), "utf8");
  assert.doesNotMatch(executionPlan, /credential\s+(?:adoption|adopt-vs-reconnect)/iu);
  assert.doesNotMatch(executionPlan, /frozen trajectories|trajectory recorder/iu);
  const productContract = readFileSync(join(_root, "docs/design/personal-agent-platform-r0-product-contract.md"), "utf8");
  assert.doesNotMatch(productContract, /credential(?:s)?\s+(?:proven\s+)?adopted/iu);
  assert.match(productContract, /every blue credential has a verified revoke\/drop outcome/iu);
});
