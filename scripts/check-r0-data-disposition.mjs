#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const _root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const _defaultMapPath = join(_root, "docs/design/personal-agent-platform-r0-data-disposition.json");
const _schemaRoot = join(_root, "apps/opencrane/prisma/schema");
const _migrationsRoot = join(_root, "apps/opencrane/prisma/migrations");
const _allowedDispositions = ["archive", "drop", "migrate", "rebuild"];
const _approvalStates = ["approved", "pending-owner-approval"];
const _requiredEstateClasses = [
  "artifact-and-upload-bytes",
  "backup-and-restore-sets",
  "blue-kubernetes-execution-state",
  "browser-and-process-sessions",
  "cognee-derived-indexes",
  "cognee-owner-memory",
  "external-source-content",
  "fleet-clustertenant-authority",
  "langfuse-clickhouse",
  "langfuse-minio-s3",
  "langfuse-postgres",
  "langfuse-valkey",
  "litellm-redis",
  "litellm-upstream-state",
  "obot-managed-mcp-volumes",
  "obot-credential-custody",
  "opencrane-cnpg-database",
  "openclaw-runtime-history",
  "skill-registry-bytes",
  "third-party-credential-values",
  "upstream-audit-and-trace",
  "usertenant-gcs-state",
  "workspace-and-persona-files",
];
const _credentialActions = ["reconnect", "recreate", "revoke", "rotate"];
const _credentialDatasetIds = new Set([
  "prisma:AccessToken",
  "prisma:McpServerCredential",
  "prisma:McpServerInstall",
  "prisma:ProviderApiKey",
  "prisma:TenantLiteLlmKey",
  "estate:litellm-upstream-state",
  "estate:obot-credential-custody",
  "estate:third-party-credential-values",
]);

/** Fail validation with one stable diagnostic. */
function _fail(message)
{
  throw new Error(`R0 data-disposition validation failed: ${message}`);
}

/** Return whether a value is a real UTC calendar date in YYYY-MM-DD form. */
function _isIsoDate(value)
{
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/** Return the current Prisma model inventory keyed by model name. */
export function _ReadPrismaInventory(schemaRoot = _schemaRoot, repositoryRoot = _root)
{
  const inventory = new Map();
  for (const filename of readdirSync(schemaRoot).filter(function _prisma(filename) { return filename.endsWith(".prisma"); }).sort())
  {
    const absolute = join(schemaRoot, filename);
    const source = readFileSync(absolute, "utf8");
    const path = relative(repositoryRoot, absolute);
    for (const match of source.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gmu))
    {
      const model = match[1];
      if (inventory.has(model)) _fail(`Prisma model ${model} is declared more than once.`);
      inventory.set(model, path);
    }
  }
  return inventory;
}

/** Derive retired table/column coordinates from the ordered Prisma migration SQL. */
export function _ReadHistoricalInventory(migrationsRoot = _migrationsRoot)
{
  const inventory = new Set(["_prisma_migrations"]);
  for (const directory of readdirSync(migrationsRoot, { withFileTypes: true }).filter(function _directory(entry) { return entry.isDirectory(); }).sort(function _sort(left, right) { return left.name.localeCompare(right.name); }))
  {
    const migration = join(migrationsRoot, directory.name, "migration.sql");
    if (!existsSync(migration)) continue;
    const source = readFileSync(migration, "utf8");
    for (const match of source.matchAll(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+"([^"]+)"/gimu)) inventory.add(match[1]);
    for (const match of source.matchAll(/ALTER\s+TABLE\s+"([^"]+)"\s+RENAME\s+TO\s+"([^"]+)"/gimu)) inventory.add(match[1]);
    for (const match of source.matchAll(/ALTER\s+TABLE\s+"([^"]+)"\s+DROP\s+COLUMN(?:\s+IF\s+EXISTS)?\s+"([^"]+)"/gimu)) inventory.add(`${match[1]}.${match[2]}`);
    for (const match of source.matchAll(/ALTER\s+TABLE\s+"([^"]+)"\s+RENAME\s+COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/gimu)) inventory.add(`${match[1]}.${match[2]}`);
  }
  return inventory;
}

/** Derive repository-owned CRD spec/status and PVC state coordinates from source. */
export function _ReadRepositoryStateInventory(repositoryRoot = _root)
{
  const inventory = new Set();
  const extensions = [".ts", ".tpl", ".yaml", ".yml"];
  function _addResource(path, kind, name, suffix)
  {
    const resourceIdentity = createHash("sha256").update(`${kind}:${name}`).digest("hex").slice(0, 16);
    const key = `${path}#${kind}-${resourceIdentity}${suffix}`;
    if (inventory.has(key)) _fail(`repository resource ${kind}:${name} is declared more than once in ${path}.`);
    inventory.add(key);
  }
  function _resourceName(source, start, kind, path)
  {
    const window = source.slice(start, start + 1200);
    const match = window.match(/metadata\s*:\s*(?:\{\s*)?[\s\S]{0,300}?\bname\s*:\s*([^\r\n,]+)/u);
    if (!match?.[1]?.trim()) _fail(`repository ${kind} in ${path} lacks a source-visible metadata name.`);
    return match[1].trim().replace(/\s+/gu, " ");
  }
  function _walk(directory)
  {
    for (const entry of readdirSync(directory, { withFileTypes: true }))
    {
      if (["dist", "node_modules"].includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory())
      {
        _walk(absolute);
        continue;
      }
      if (!entry.isFile() || !extensions.some(function _extension(extension) { return entry.name.endsWith(extension); })) continue;
      const source = readFileSync(absolute, "utf8");
      const path = relative(repositoryRoot, absolute);
      for (const match of source.matchAll(/kind:\s*CustomResourceDefinition\b/gu))
      {
        const name = _resourceName(source, match.index, "crd", path);
        _addResource(path, "crd", name, "-spec");
        _addResource(path, "crd", name, "-status");
      }
      for (const match of source.matchAll(/kind:\s*["']?PersistentVolumeClaim["']?\b/gu))
      {
        const name = _resourceName(source, match.index, "pvc", path);
        _addResource(path, "pvc", name, "");
      }
    }
  }
  for (const root of ["apps", "libs", "platform"])
  {
    const absolute = join(repositoryRoot, root);
    if (existsSync(absolute)) _walk(absolute);
  }
  return inventory;
}

/** Derive the stable public ID for a source-derived repository state coordinate. */
export function _RepositoryStateId(key)
{
  return `estate:repository-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

/** Validate one parsed R0 disposition map against a Prisma inventory. */
export function _ValidateDispositionMap(map, inventory = _ReadPrismaInventory(), historicalInventory = _ReadHistoricalInventory(), repositoryStateInventory = _ReadRepositoryStateInventory())
{
  if (map.schemaVersion !== 1) _fail("schemaVersion must be 1.");
  if (map.status !== "proposal-owner-approval-required") _fail("status must keep owner approval explicit.");
  if (map.cleanGreen?.compatibilityAllowed !== false) _fail("compatibilityAllowed must be false.");
  if (map.cleanGreen?.dualPathAllowed !== false) _fail("dualPathAllowed must be false.");
  if (map.cleanGreen?.legacyStoreAdoptionAllowed !== false) _fail("legacyStoreAdoptionAllowed must be false.");
  if (map.cleanGreen?.legacyDatabaseAdoptionAllowed !== false) _fail("legacyDatabaseAdoptionAllowed must be false.");
  if (map.cleanGreen?.legacyCredentialAdoptionAllowed !== false) _fail("legacyCredentialAdoptionAllowed must be false.");
  if (map.cleanGreen?.legacyIdentityAdoptionAllowed !== false) _fail("legacyIdentityAdoptionAllowed must be false.");
  if (map.cleanGreen?.legacyKeyAdoptionAllowed !== false) _fail("legacyKeyAdoptionAllowed must be false.");
  if (map.cleanGreen?.reverseBridgeAllowed !== false) _fail("reverseBridgeAllowed must be false.");
  if (JSON.stringify(map.cleanGreen?.allowedDispositions) !== JSON.stringify(_allowedDispositions))
  {
    _fail("allowedDispositions must be archive, drop, migrate, rebuild in canonical order.");
  }
  const approvalPolicy = map.approvalPolicies?.["r0-dataset-disposition"];
  const requiredAuthorities = ["data-owner", "fleet-owner", "integration-owner", "legal-security-owner", "operations-owner", "product-customer-owner"];
  if (JSON.stringify(approvalPolicy?.requiredAuthorities) !== JSON.stringify(requiredAuthorities))
  {
    _fail("r0-dataset-disposition must require the canonical owner authorities.");
  }
  const lifecyclePolicies = map.lifecyclePolicies;
  if (lifecyclePolicies?.migrate?.sourceAccess !== "read-only" || lifecyclePolicies?.migrate?.writeDirection !== "blue-read-green-write"
    || lifecyclePolicies?.migrate?.importer !== "idempotent" || lifecyclePolicies?.migrate?.runtimeReachable !== false
    || lifecyclePolicies?.migrate?.legacyStoreAdopted !== false || lifecyclePolicies?.migrate?.postWriteRecovery !== "forward-only"
    || lifecyclePolicies?.migrate?.validationManifest !== "required" || lifecyclePolicies?.migrate?.removalGate !== "R10")
  {
    _fail("migrate lifecycle policy must enforce bounded clean-green execution and R10 removal.");
  }
  if (lifecyclePolicies?.archive?.retention !== "required-before-execution" || lifecyclePolicies?.archive?.deletionOwner !== "required-before-execution"
    || lifecyclePolicies?.archive?.terminalAction !== "drop-or-approved-permanent-record" || lifecyclePolicies?.archive?.removalGate !== "R10")
  {
    _fail("archive lifecycle policy must enforce retention, deletion ownership, and terminal action.");
  }
  if (lifecyclePolicies?.drop?.deletionOwner !== "required-before-execution" || lifecyclePolicies?.drop?.reasonEvidence !== "required-before-execution")
  {
    _fail("drop lifecycle policy must enforce deletion ownership and reason evidence.");
  }
  if (lifecyclePolicies?.rebuild?.reproducibilityProof !== "required-before-blue-deletion" || lifecyclePolicies?.rebuild?.legacyStoreAdopted !== false)
  {
    _fail("rebuild lifecycle policy must enforce reproducibility and forbid legacy-store adoption.");
  }
  if (!Array.isArray(map.datasets) || map.datasets.length === 0) _fail("datasets must be a non-empty array.");

  const ids = new Set();
  const prismaCoverage = new Map();
  const historicalCoverage = new Set();
  const repositoryStateCoverage = new Set();
  const estateCoverage = new Set();
  for (const dataset of map.datasets)
  {
    if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) _fail("every dataset must be an object.");
    if (!/^(prisma|historical|estate):[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/u.test(dataset.id ?? "")) _fail("every dataset needs a stable prisma:, historical:, or estate: id.");
    if (ids.has(dataset.id)) _fail(`dataset ${dataset.id} is duplicated.`);
    ids.add(dataset.id);
    if (!_allowedDispositions.includes(dataset.disposition)) _fail(`dataset ${dataset.id} has an invalid disposition.`);
    if (!_approvalStates.includes(dataset.approval)) _fail(`dataset ${dataset.id} has an invalid approval state.`);
    if (dataset.approvalPolicy !== "r0-dataset-disposition") _fail(`dataset ${dataset.id} lacks the canonical approval policy.`);
    if (dataset.lifecyclePolicy !== dataset.disposition) _fail(`dataset ${dataset.id} has the wrong lifecycle policy.`);
    if (dataset.approval === "approved")
    {
      const evidence = dataset.approvalEvidence;
      if (!evidence || typeof evidence !== "object") _fail(`approved dataset ${dataset.id} lacks approvalEvidence.`);
      if (typeof evidence.approver !== "string" || !evidence.approver.trim()) _fail(`approved dataset ${dataset.id} lacks an approver.`);
      if (!Array.isArray(evidence.authorities) || JSON.stringify([...new Set(evidence.authorities)].sort()) !== JSON.stringify(requiredAuthorities))
      {
        _fail(`approved dataset ${dataset.id} lacks one or more required authorities.`);
      }
      if (!_isIsoDate(evidence.date)) _fail(`approved dataset ${dataset.id} lacks a valid ISO approval date.`);
      if (typeof evidence.reference !== "string" || !evidence.reference.trim()) _fail(`approved dataset ${dataset.id} lacks a stable approval reference.`);
      const lifecycle = dataset.lifecycleEvidence;
      if (!lifecycle || typeof lifecycle !== "object") _fail(`approved dataset ${dataset.id} lacks lifecycleEvidence.`);
      if (dataset.disposition === "migrate")
      {
        const required = ["migrationOwner", "removalOwner", "removalCondition", "removalReference", "sourceCheckpoint", "validationManifestReference"];
        if (required.some(function _missing(field) { return typeof lifecycle[field] !== "string" || !lifecycle[field].trim(); }) || lifecycle.removalGate !== "R10")
        {
          _fail(`approved migrated dataset ${dataset.id} lacks concrete migration and R10 removal evidence.`);
        }
      }
      if (dataset.disposition === "archive")
      {
        const required = ["retention", "deletionOwner", "terminalTrigger"];
        if (required.some(function _missing(field) { return typeof lifecycle[field] !== "string" || !lifecycle[field].trim(); })
          || lifecycle.removalGate !== "R10"
          || !["drop", "permanent-record"].includes(lifecycle.terminalAction))
        {
          _fail(`approved archived dataset ${dataset.id} lacks concrete retention and terminal disposition evidence.`);
        }
      }
      if (dataset.disposition === "drop")
      {
        const required = ["deletionOwner", "reason", "reasonReference"];
        if (required.some(function _missing(field) { return typeof lifecycle[field] !== "string" || !lifecycle[field].trim(); }))
        {
          _fail(`approved dropped dataset ${dataset.id} lacks concrete deletion evidence.`);
        }
      }
      if (dataset.disposition === "rebuild")
      {
        const required = ["reproducibilityProof", "proofReference", "blueDeletionOwner"];
        if (required.some(function _missing(field) { return typeof lifecycle[field] !== "string" || !lifecycle[field].trim(); }))
        {
          _fail(`approved rebuilt dataset ${dataset.id} lacks concrete reproducibility evidence.`);
        }
      }
    }
    if (dataset.disposition === "migrate" && (dataset.migrationMode !== "one-way-semantic" || dataset.sourceReproducibility !== "non-reproducible-owner-state"))
    {
      _fail(`migrated dataset ${dataset.id} must be typed as one-way semantic non-reproducible owner state.`);
    }
    if (dataset.disposition !== "migrate" && dataset.migrationMode !== undefined)
    {
      _fail(`non-migrated dataset ${dataset.id} must not declare migrationMode.`);
    }
    if (dataset.disposition !== "migrate" && dataset.sourceReproducibility !== undefined)
    {
      _fail(`non-migrated dataset ${dataset.id} must not declare sourceReproducibility.`);
    }
    if (dataset.credentialAction !== undefined && !_credentialActions.includes(dataset.credentialAction))
    {
      _fail(`dataset ${dataset.id} has an invalid credentialAction.`);
    }
    if (dataset.credentialAction !== undefined && dataset.disposition === "migrate") _fail(`credential dataset ${dataset.id} cannot migrate.`);
    if (_credentialDatasetIds.has(dataset.id) && dataset.credentialAction === undefined) _fail(`credential dataset ${dataset.id} lacks a green credential action.`);
    if (typeof dataset.greenAuthority !== "string" || !dataset.greenAuthority.trim()) _fail(`dataset ${dataset.id} lacks greenAuthority.`);
    if (typeof dataset.rule !== "string" || !dataset.rule.trim()) _fail(`dataset ${dataset.id} lacks a cutover rule.`);

    if (dataset.source?.kind === "prisma-model")
    {
      const model = dataset.source.model;
      if (typeof model !== "string" || !model) _fail(`dataset ${dataset.id} lacks a Prisma model name.`);
      if (dataset.id !== `prisma:${model}`) _fail(`dataset ${dataset.id} does not match its Prisma source identity.`);
      if (prismaCoverage.has(model)) _fail(`Prisma model ${model} is covered more than once.`);
      prismaCoverage.set(model, dataset.source.path);
      continue;
    }
    if (dataset.source?.kind === "estate-class")
    {
      const estateClass = dataset.source.class;
      if (typeof estateClass !== "string" || !estateClass) _fail(`dataset ${dataset.id} lacks an estate class.`);
      if (dataset.id !== `estate:${estateClass}`) _fail(`dataset ${dataset.id} does not match its estate source identity.`);
      if (estateCoverage.has(estateClass)) _fail(`estate class ${estateClass} is covered more than once.`);
      estateCoverage.add(estateClass);
      continue;
    }
    if (dataset.source?.kind === "historical-state")
    {
      const historicalState = dataset.source.state;
      if (typeof historicalState !== "string" || !historicalState) _fail(`dataset ${dataset.id} lacks a historical state name.`);
      if (dataset.id !== `historical:${historicalState}`) _fail(`dataset ${dataset.id} does not match its historical source identity.`);
      if (historicalCoverage.has(historicalState)) _fail(`historical state ${historicalState} is covered more than once.`);
      historicalCoverage.add(historicalState);
      continue;
    }
    if (dataset.source?.kind === "repository-state")
    {
      const repositoryState = dataset.source.key;
      if (typeof repositoryState !== "string" || !repositoryState) _fail(`dataset ${dataset.id} lacks a repository state key.`);
      if (dataset.id !== _RepositoryStateId(repositoryState)) _fail(`dataset ${dataset.id} does not match its repository source identity.`);
      if (repositoryStateCoverage.has(repositoryState)) _fail(`repository state ${repositoryState} is covered more than once.`);
      repositoryStateCoverage.add(repositoryState);
      continue;
    }
    _fail(`dataset ${dataset.id} has an invalid source kind.`);
  }

  const missingModels = [...inventory.keys()].filter(function _missing(model) { return !prismaCoverage.has(model); }).sort();
  const staleModels = [...prismaCoverage.keys()].filter(function _stale(model) { return !inventory.has(model); }).sort();
  const wrongPaths = [...prismaCoverage.entries()].filter(function _wrong(entry) { return inventory.get(entry[0]) !== entry[1]; });
  if (missingModels.length) _fail(`unclassified Prisma models: ${missingModels.join(", ")}.`);
  if (staleModels.length) _fail(`unknown Prisma models: ${staleModels.join(", ")}.`);
  if (wrongPaths.length) _fail(`Prisma model source paths do not match the schema: ${wrongPaths.map(function _name(entry) { return entry[0]; }).join(", ")}.`);

  const missingHistorical = [...historicalInventory].filter(function _missing(entry) { return !historicalCoverage.has(entry); }).sort();
  const staleHistorical = [...historicalCoverage].filter(function _stale(entry) { return !historicalInventory.has(entry); }).sort();
  if (missingHistorical.length) _fail(`unclassified required historical states: ${missingHistorical.join(", ")}.`);
  if (staleHistorical.length) _fail(`unknown historical states: ${staleHistorical.join(", ")}.`);

  const missingRepositoryState = [...repositoryStateInventory].filter(function _missing(entry) { return !repositoryStateCoverage.has(entry); }).sort();
  const staleRepositoryState = [...repositoryStateCoverage].filter(function _stale(entry) { return !repositoryStateInventory.has(entry); }).sort();
  if (missingRepositoryState.length) _fail(`unclassified repository states: ${missingRepositoryState.join(", ")}.`);
  if (staleRepositoryState.length) _fail(`unknown repository states: ${staleRepositoryState.join(", ")}.`);

  const missingEstate = _requiredEstateClasses.filter(function _missing(entry) { return !estateCoverage.has(entry); });
  const staleEstate = [...estateCoverage].filter(function _stale(entry) { return !_requiredEstateClasses.includes(entry); }).sort();
  if (missingEstate.length) _fail(`unclassified required estate classes: ${missingEstate.join(", ")}.`);
  if (staleEstate.length) _fail(`unknown estate classes: ${staleEstate.join(", ")}.`);
  return { prismaModels: prismaCoverage.size, historicalStates: historicalCoverage.size, repositoryStates: repositoryStateCoverage.size, estateClasses: estateCoverage.size, datasets: ids.size };
}

/** Parse CLI arguments and validate the selected map. */
function _Main(argv)
{
  let mapPath = _defaultMapPath;
  if (argv.length)
  {
    if (argv.length !== 2 || argv[0] !== "--map") _fail("usage: check-r0-data-disposition.mjs [--map PATH].");
    mapPath = resolve(argv[1]);
  }
  if (!existsSync(mapPath)) _fail(`map does not exist: ${mapPath}.`);
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  const result = _ValidateDispositionMap(map);
  process.stdout.write(`R0 data-disposition coverage passed: ${result.prismaModels} Prisma models, ${result.historicalStates} historical states, ${result.repositoryStates} repository states, ${result.estateClasses} upstream estate classes, ${result.datasets} total datasets.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
  try
  {
    _Main(process.argv.slice(2));
  }
  catch (error)
  {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
