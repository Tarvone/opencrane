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

test("lifecycle policy cannot make the legacy store reachable or adopted", function _lifecyclePolicy()
{
  const map = _copyMap();
  map.lifecyclePolicies.migrate.runtimeReachable = true;
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /migrate lifecycle policy must enforce bounded clean-green execution/u);
});

test("migrate always means one-way semantic import", function _oneWay()
{
  const map = _copyMap();
  const migrated = map.datasets.find(function _migrated(entry) { return entry.disposition === "migrate"; });
  delete migrated.migrationMode;
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /one-way semantic non-reproducible owner state/u);
});

test("credential state can never be changed to migrate", function _credentialMigration()
{
  const map = _copyMap();
  const credential = map.datasets.find(function _credential(entry) { return entry.id === "prisma:ProviderApiKey"; });
  credential.disposition = "migrate";
  credential.lifecyclePolicy = "migrate";
  credential.sourceReproducibility = "non-reproducible-owner-state";
  credential.migrationMode = "one-way-semantic";
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /credential dataset prisma:ProviderApiKey cannot migrate/u);
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
    ["migrate", /lacks lifecycleEvidence/u],
    ["archive", /lacks lifecycleEvidence/u],
    ["drop", /lacks lifecycleEvidence/u],
    ["rebuild", /lacks lifecycleEvidence/u],
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

test("approved migration evidence is bound to the R10 removal gate", function _r10Removal()
{
  const map = _copyMap();
  const dataset = map.datasets.find(function _migrate(entry) { return entry.disposition === "migrate"; });
  dataset.approval = "approved";
  dataset.approvalEvidence = structuredClone(_approvalEvidence);
  dataset.lifecycleEvidence = {
    migrationOwner: "migration-owner",
    removalOwner: "reaper-owner",
    removalGate: "never",
    removalCondition: "all approved imports verified",
    removalReference: "issue:removal",
    sourceCheckpoint: "checkpoint:1",
    validationManifestReference: "manifest:1",
  };
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /lacks concrete migration and R10 removal evidence/u);
});

test("known historical state cannot silently disappear", function _historicalCoverage()
{
  const map = _copyMap();
  const index = map.datasets.findIndex(function _historical(entry) { return entry.id === "historical:brokered_devices"; });
  map.datasets.splice(index, 1);
  assert.throws(function _validate() { _ValidateDispositionMap(map, _inventory); }, /unclassified required historical states: brokered_devices/u);
});

test("a newly discovered migration residue fails closed", function _newHistoricalState()
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

test("active architecture never regresses to an OpenClaw adapter", function _architectureWording()
{
  const architecture = readFileSync(join(_root, "docs/design/personal-agent-platform-architecture.md"), "utf8");
  assert.doesNotMatch(architecture, /OpenClaw compatibility adapter during migration/u);
  assert.match(architecture, /OpenClaw never enters green/u);
  const loopPlan = readFileSync(join(_root, "docs/design/openclaw-agent-loop-replacement-plan.md"), "utf8");
  assert.doesNotMatch(loopPlan, /### L2 — bridge OpenClaw into the canonical plane/u);
  assert.match(loopPlan, /L2 — superseded bridge \(strangler route only; do not execute under rewrite-freeze\)/u);
  assert.doesNotMatch(loopPlan, /unless a reverse migration is executed/u);
  const executionPlan = readFileSync(join(_root, "plan.md"), "utf8");
  assert.doesNotMatch(executionPlan, /credential\s+(?:adoption|adopt-vs-reconnect)/iu);
});
