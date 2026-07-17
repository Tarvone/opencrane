#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const _collectorVersion = "1";
const _querySetVersion = "r0-safe-metadata-v2";
const _root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const _reviewsRoot = join(_root, ".agent-reviews");
const _maxOutputBytes = 25 * 1024 * 1024;
const _maxFailureBytes = 16 * 1024;
const _kubernetesTableResources = new Map([
  ["namespaces", false],
  ["clustertenants.opencrane.io", false],
  ["tenants.opencrane.io", true],
  ["accesspolicies.opencrane.io", true],
  ["mcpservers.opencrane.io", true],
  ["schedules.opencrane.io", true],
  ["skillregistries.opencrane.io", true],
  ["deployments.apps,statefulsets.apps,daemonsets.apps,cronjobs.batch,jobs.batch", true],
  ["pods", true],
  ["persistentvolumeclaims", true],
  ["networkpolicies.networking.k8s.io", true],
  ["resourcequotas,limitranges", true],
  ["storageclasses.storage.k8s.io", false],
  ["clusters.postgresql.cnpg.io", true],
  ["backups.postgresql.cnpg.io", true],
  ["scheduledbackups.postgresql.cnpg.io", true],
  ["volumesnapshots.snapshot.storage.k8s.io", true],
  ["certificates.cert-manager.io", true],
  ["dnsendpoints.externaldns.k8s.io", true],
]);

/** Print command usage. */
function _usage()
{
  process.stdout.write(`Usage:
  scripts/collect-r0-estate-evidence.mjs --output-dir /absolute/new/directory [options]

Options:
  --context NAME                 Required explicit context to inspect; repeatable.
  --database LABEL=PGSERVICE    Collect metadata-only SQL through a libpq service; repeatable.
  --allow-local-agent-reviews   Explicitly allow the private, local-only evidence enclave.
  --request-timeout SECONDS     Per-command timeout, 1-60 (default: 10).
  --help                        Show this help.

The destination must be an absent canonical direct child of the repository's pre-existing
.agent-reviews/ directory. That enclave and every output directory are mode 0700; files are mode
0600. All paths must be current-user-owned and fully ignored by Git. Local ignored evidence is not
durable. Database targets accept libpq service names only; connection strings and raw credentials
are rejected.
`);
}

/** Parse and validate command-line options without touching the filesystem. */
function _parseArguments(argv)
{
  const options = { outputDir: "", contexts: [], databases: [], allowLocalAgentReviews: false, requestTimeout: 10 };
  for (let index = 0; index < argv.length; index += 1)
  {
    const argument = argv[index];
    if (argument === "--help")
    {
      _usage();
      process.exit(0);
    }
    if (argument === "--output-dir")
    {
      options.outputDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (argument === "--context")
    {
      const context = argv[index + 1] ?? "";
      if (!context || /[\t\r\n\0]/u.test(context)) throw new Error("--context requires a non-empty single-line value.");
      options.contexts.push(context);
      index += 1;
      continue;
    }
    if (argument === "--database")
    {
      const target = argv[index + 1] ?? "";
      const separator = target.indexOf("=");
      if (separator <= 0 || separator === target.length - 1) throw new Error("--database must be LABEL=PGSERVICE.");
      const label = target.slice(0, separator);
      const service = target.slice(separator + 1);
      const safeName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
      if (!safeName.test(label) || !safeName.test(service))
      {
        throw new Error("--database accepts only simple LABEL=PGSERVICE names; connection strings and credentials are forbidden.");
      }
      options.databases.push({ label, service });
      index += 1;
      continue;
    }
    if (argument === "--allow-local-agent-reviews")
    {
      options.allowLocalAgentReviews = true;
      continue;
    }
    if (argument === "--request-timeout")
    {
      const seconds = Number(argv[index + 1]);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) throw new Error("--request-timeout must be an integer from 1 to 60.");
      options.requestTimeout = seconds;
      index += 1;
      continue;
    }
    throw new Error("Unknown argument; use --help for the supported options.");
  }
  if (!options.outputDir) throw new Error("--output-dir is required.");
  if (!isAbsolute(options.outputDir)) throw new Error("--output-dir must be an absolute path.");
  if (options.contexts.length === 0) throw new Error("At least one explicit --context is required.");
  if (!options.allowLocalAgentReviews) throw new Error("--allow-local-agent-reviews is required for local ignored evidence.");
  const databaseLabels = new Set(options.databases.map(function _label(database) { return database.label; }));
  if (databaseLabels.size !== options.databases.length) throw new Error("Each --database label must be unique.");
  return options;
}

/** Create a new private output directory after resolving and validating its parent. */
function _createOutputDirectory(requested)
{
  if (requested !== resolve(requested)) throw new Error("--output-dir must be a canonical absolute path without dot components.");
  const safeBasename = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
  if (dirname(requested) !== _reviewsRoot || !safeBasename.test(basename(requested)))
  {
    throw new Error("--output-dir must be a direct safe-named child of the active worktree's .agent-reviews directory.");
  }
  if (lstatSync(requested, { throwIfNoEntry: false })) throw new Error("--output-dir must not already exist.");
  if (typeof process.getuid !== "function") throw new Error("--output-dir ownership cannot be verified on this platform.");
  const currentUserId = process.getuid();
  const repositoryStatus = lstatSync(_root);
  if (repositoryStatus.uid !== currentUserId) throw new Error("The repository root must be owned by the current user.");
  if (!existsSync(_reviewsRoot)) throw new Error("The active worktree's .agent-reviews directory must pre-exist with mode 0700.");
  const reviewsStatus = lstatSync(_reviewsRoot);
  if (reviewsStatus.isSymbolicLink() || !reviewsStatus.isDirectory() || realpathSync(_reviewsRoot) !== _reviewsRoot
    || reviewsStatus.uid !== currentUserId || (reviewsStatus.mode & 0o777) !== 0o700)
  {
    throw new Error("The repository's .agent-reviews directory must be canonical, mode 0700, and owned by the current user.");
  }
  const ignored = _isGitIgnored(requested) && _isGitIgnored(join(requested, ".collector-ignore-probe"));
  const trackedIgnoreFile = spawnSync("git", ["-C", _root, "ls-files", "--error-unmatch", "--", ".gitignore"], {
    cwd: _root,
    encoding: "utf8",
  });
  const tracked = spawnSync("git", ["-C", _root, "ls-files", "--", ".agent-reviews"], {
    cwd: _root,
    encoding: "utf8",
  });
  if (!ignored || trackedIgnoreFile.status !== 0 || tracked.status !== 0 || tracked.stdout.trim())
  {
    throw new Error("The .agent-reviews enclave must be fully Git-ignored and contain no tracked files.");
  }
  const parentStatus = lstatSync(_reviewsRoot);
  if (parentStatus.isSymbolicLink()) throw new Error("--output-dir parent must not be a symbolic link.");
  if (!parentStatus.isDirectory()) throw new Error("--output-dir parent must already exist and be a directory.");
  if (parentStatus.uid !== currentUserId) throw new Error("--output-dir parent must be owned by the current user.");
  const realParent = realpathSync(_reviewsRoot);
  if (realParent !== _reviewsRoot) throw new Error("--output-dir parent path must not contain symbolic-link components.");
  const target = join(realParent, basename(requested));
  if ((parentStatus.mode & 0o077) !== 0) throw new Error("--output-dir parent must not be group- or world-accessible.");
  mkdirSync(target, { mode: 0o700 });
  chmodSync(target, 0o700);
  const targetStatus = lstatSync(target);
  if (targetStatus.isSymbolicLink() || !targetStatus.isDirectory() || realpathSync(target) !== target
    || targetStatus.uid !== currentUserId || (targetStatus.mode & 0o777) !== 0o700)
  {
    throw new Error("--output-dir could not be proven to be a private current-user-owned directory.");
  }
  const output = {
    outputDir: target,
    reviewsIdentity: { dev: reviewsStatus.dev, ino: reviewsStatus.ino },
    targetIdentity: { dev: targetStatus.dev, ino: targetStatus.ino },
  };
  _verifyEvidenceEnclave(output.outputDir, output.reviewsIdentity, output.targetIdentity);
  return output;
}

/** Prove that one exact path is covered by the tracked root ignore rule. */
function _isGitIgnored(path)
{
  const result = spawnSync("git", ["-C", _root, "check-ignore", "--verbose", "--no-index", "--", path], {
    cwd: _root,
    encoding: "utf8",
  });
  if (result.status !== 0) return false;
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  if (lines.length !== 1) return false;
  const separatorIndex = lines[0].indexOf("\t");
  if (separatorIndex < 0) return false;
  const rule = lines[0].slice(0, separatorIndex);
  const parts = rule.split(":");
  if (parts.length < 3) return false;
  const source = parts.slice(0, -2).join(":");
  const pattern = parts.at(-1);
  return [".gitignore", join(_root, ".gitignore")].includes(source) && pattern === "/.agent-reviews/";
}

/** Revalidate enclave identities and Git-ignore coverage before publishing a complete pack. */
function _verifyEvidenceEnclave(outputDir, reviewsIdentity, targetIdentity)
{
  if (typeof process.getuid !== "function") throw new Error("Evidence ownership cannot be verified on this platform.");
  const currentUserId = process.getuid();
  const reviewsStatus = lstatSync(_reviewsRoot);
  const targetStatus = lstatSync(outputDir);
  if (reviewsStatus.isSymbolicLink() || !reviewsStatus.isDirectory() || realpathSync(_reviewsRoot) !== _reviewsRoot
    || reviewsStatus.uid !== currentUserId || (reviewsStatus.mode & 0o777) !== 0o700
    || reviewsStatus.dev !== reviewsIdentity.dev || reviewsStatus.ino !== reviewsIdentity.ino)
  {
    throw new Error("The .agent-reviews enclave identity or security properties changed during collection.");
  }
  if (targetStatus.isSymbolicLink() || !targetStatus.isDirectory() || realpathSync(outputDir) !== outputDir
    || targetStatus.uid !== currentUserId || (targetStatus.mode & 0o777) !== 0o700
    || targetStatus.dev !== targetIdentity.dev || targetStatus.ino !== targetIdentity.ino)
  {
    throw new Error("The evidence output identity or security properties changed during collection.");
  }
  const entries = [];
  function _walk(directory)
  {
    entries.push(directory);
    for (const entry of readdirSync(directory, { withFileTypes: true }))
    {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Evidence output unexpectedly contains a symbolic link.");
      if (entry.isDirectory()) _walk(absolute);
      else if (entry.isFile()) entries.push(absolute);
      else throw new Error("Evidence output contains an unsupported filesystem entry.");
    }
  }
  _walk(outputDir);
  if (entries.some(function _trackable(entry) { return !_isGitIgnored(entry); }))
  {
    throw new Error("An evidence-pack entry is no longer covered by the .agent-reviews Git ignore rule.");
  }
  const tracked = spawnSync("git", ["-C", _root, "ls-files", "--", ".agent-reviews"], {
    cwd: _root,
    encoding: "utf8",
  });
  if (tracked.status !== 0 || tracked.stdout.trim()) throw new Error("The .agent-reviews enclave contains a tracked path.");
}

/** Return an ISO-8601 UTC timestamp. */
function _now()
{
  return new Date().toISOString();
}

/** Return a SHA-256 digest for bytes or text. */
function _sha256(value)
{
  return createHash("sha256").update(value).digest("hex");
}

/** Recursively sort object keys so semantic hashes are reproducible. */
function _canonical(value)
{
  if (Array.isArray(value)) return value.map(_canonical);
  if (value && typeof value === "object")
  {
    return Object.fromEntries(Object.keys(value).sort().map(function _entry(key) { return [key, _canonical(value[key])]; }));
  }
  return value;
}

/** Hash one JSON-compatible value without persisting its source fields. */
function _objectHash(value)
{
  return _sha256(JSON.stringify(_canonical(value ?? null)));
}

/** Restrict a path to the newly-created output directory. */
function _inside(outputDir, relativePath)
{
  const candidate = resolve(outputDir, relativePath);
  if (candidate !== outputDir && !candidate.startsWith(`${outputDir}${sep}`)) throw new Error("Internal evidence path escaped the output directory.");
  return candidate;
}

/** Create an internal private directory. */
function _makePrivateDirectory(outputDir, relativePath)
{
  if (typeof process.getuid !== "function") throw new Error("Evidence ownership cannot be verified on this platform.");
  const currentUserId = process.getuid();
  const components = relativePath === "" ? [] : relativePath.split(sep);
  if (components.some(function _unsafe(component) { return !component || component === "." || component === ".."; }))
  {
    throw new Error("Internal evidence directory contains an unsafe path component.");
  }
  let directory = outputDir;
  for (const component of components)
  {
    directory = _inside(outputDir, relative(outputDir, join(directory, component)));
    if (!lstatSync(directory, { throwIfNoEntry: false })) mkdirSync(directory, { mode: 0o700 });
    const status = lstatSync(directory);
    if (status.isSymbolicLink() || !status.isDirectory() || status.uid !== currentUserId
      || (status.mode & 0o777) !== 0o700 || realpathSync(directory) !== directory)
    {
      throw new Error("Internal evidence directory is not canonical, private, and current-user-owned.");
    }
  }
  return directory;
}

/** Write a new private file. */
function _writePrivate(outputDir, relativePath, content)
{
  const file = _inside(outputDir, relativePath);
  _makePrivateDirectory(outputDir, relative(outputDir, dirname(file)));
  if (existsSync(file)) throw new Error(`Evidence file already exists: ${relativePath}`);
  const temporary = join(dirname(file), `.partial-${basename(file)}-${randomUUID()}`);
  writeFileSync(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
  chmodSync(file, 0o600);
  return file;
}

/** Append one JSON record to a private NDJSON file. */
function _appendRecord(file, record)
{
  appendFileSync(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(file, 0o600);
}

/** Assert that a subprocess invocation cannot mutate a cluster, release, or database. */
function _assertReadOnlyCommand(command, args, options)
{
  if (command === "git")
  {
    const isRevision = args[0] === "-C" && args[1] === _root && args[2] === "rev-parse" && args[3] === "HEAD";
    const isStatus = args[0] === "-C" && args[1] === _root && args[2] === "status" && args[3] === "--short";
    if (!isRevision && !isStatus) throw new Error("Collector attempted a non-read-only git command.");
    return;
  }
  if (command === "kubectl")
  {
    const isContexts = JSON.stringify(args) === JSON.stringify(["config", "get-contexts", "-o", "name"]);
    let verbIndex = 0;
    if (args[verbIndex] === "--context") verbIndex += 2;
    if (args[verbIndex]?.startsWith("--request-timeout=")) verbIndex += 1;
    const isClientVersion = JSON.stringify(args) === JSON.stringify(["version", "--client=true", "-o", "json"]);
    const isServerVersion = verbIndex === 2 && args[0] === "--context" && args[1]
      && JSON.stringify(args.slice(verbIndex)) === JSON.stringify(["version", "-o", "json"]);
    const isVersion = isClientVersion || isServerVersion;
    const isGet = args[verbIndex] === "get";
    const resource = isGet ? args[verbIndex + 1] ?? "" : "";
    if (/(^|[.,/])secrets?([.,/]|$)/iu.test(resource)) throw new Error("Collector refuses to request Kubernetes Secret resources.");
    if (/(^|[.,/])configmaps?([.,/]|$)/iu.test(resource)) throw new Error("Collector refuses to request Kubernetes ConfigMap resources.");
    if (!isVersion && !isContexts && !isGet) throw new Error("Collector attempted a non-read-only kubectl command.");
    const isReadiness = isGet && resource === "--raw=/readyz";
    if (isReadiness)
    {
      const hasExplicitContextAndTimeout = verbIndex === 3 && args[0] === "--context" && args[1]
        && /^--request-timeout=[1-9][0-9]?s$/u.test(args[2]);
      if (!hasExplicitContextAndTimeout || args.length !== verbIndex + 2)
      {
        throw new Error("Collector attempted an unapproved Kubernetes readiness query.");
      }
    }
    if (isGet && !isReadiness)
    {
      const allNamespaces = _kubernetesTableResources.get(resource);
      const expectedTail = ["get", resource, ...(allNamespaces ? ["--all-namespaces"] : []), "--server-print=true", "--no-headers"];
      const hasExplicitContextAndTimeout = verbIndex === 3 && args[0] === "--context" && args[1]
        && /^--request-timeout=[1-9][0-9]?s$/u.test(args[2]);
      if (allNamespaces === undefined || !hasExplicitContextAndTimeout
        || JSON.stringify(args.slice(verbIndex)) !== JSON.stringify(expectedTail))
      {
        throw new Error("Collector refuses Kubernetes reads outside the exact server-returned metadata-table allowlist.");
      }
    }
    return;
  }
  if (command === "helm")
  {
    const isVersion = args[0] === "version";
    if (!isVersion) throw new Error("Collector attempted a Helm state read; release storage may contain Kubernetes Secrets.");
    return;
  }
  if (command === "psql")
  {
    const isVersion = args.includes("--version") && options.input === undefined;
    const isEvidenceQuery = options.input === _databaseQuery
      && options.provenanceEnvironment?.PGOPTIONS?.includes("default_transaction_read_only=on");
    if (isVersion) return;
    if (!args.includes("--no-psqlrc") || !args.some(function _service(argument) { return argument.startsWith("service="); }))
    {
      throw new Error("Collector attempted an unapproved psql invocation.");
    }
    if (!isVersion && !isEvidenceQuery) throw new Error("Collector attempted an unapproved psql query.");
    return;
  }
  throw new Error(`Collector attempted an unapproved command: ${command}`);
}

/** Quote one argument for human-readable provenance only. */
function _shellQuote(argument)
{
  if (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(argument)) return argument;
  return `'${argument.replaceAll("'", `'"'"'`)}'`;
}

/** Create a command runner that records exact arguments, timestamps, status, and failures. */
function _commandRunner(outputDir, provenanceFile, failuresFile)
{
  let sequence = 0;
  return function _run(operation, command, args, options = {}) {
    _assertReadOnlyCommand(command, args, options);
    sequence += 1;
    const startedAt = _now();
    const result = spawnSync(command, args, {
      cwd: _root,
      encoding: "utf8",
      env: options.env ?? process.env,
      input: options.input,
      maxBuffer: _maxOutputBytes,
      timeout: options.timeoutMs,
    });
    const completedAt = _now();
    const status = typeof result.status === "number" ? result.status : 124;
    const stderr = `${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`.trim();
    const record = {
      sequence,
      operation,
      startedAt,
      completedAt,
      status,
      signal: result.signal ?? null,
      command: [command, ...args],
      displayCommand: [command, ...args].map(_shellQuote).join(" "),
      stdinSha256: options.input === undefined ? null : _sha256(options.input),
      environment: options.provenanceEnvironment ?? null,
    };
    _appendRecord(provenanceFile, record);
    if (status !== 0)
    {
      _appendRecord(failuresFile, {
        sequence,
        operation,
        status,
        stderr: stderr.slice(0, _maxFailureBytes),
        truncated: stderr.length > _maxFailureBytes,
      });
    }
    return { ok: status === 0, stdout: result.stdout ?? "", stderr, status, sequence };
  };
}

/** Parse a trusted tool JSON response and record a failure instead of leaking raw output. */
function _parseJson(result, operation, failuresFile)
{
  if (!result.ok) return null;
  try
  {
    return JSON.parse(result.stdout);
  }
  catch (error)
  {
    _appendRecord(failuresFile, { operation, status: "invalid-json", stderr: String(error), truncated: false });
    return null;
  }
}

/** Normalize a server-returned Kubernetes Table without requesting full resource objects. */
function _serverTableRows(result, operation, failuresFile)
{
  if (!result.ok) return null;
  const trimmed = result.stdout.trim();
  if (/^[{[]/u.test(trimmed))
  {
    _appendRecord(failuresFile, { operation, status: "unexpected-full-object-output", stderr: "kubectl returned a full-object shape instead of a server table.", truncated: false });
    return null;
  }
  return trimmed ? trimmed.split("\n").map(function _row(row) { return row.replace(/\r$/u, ""); }).sort() : [];
}

/** Build a secured start/end watermark from only the server-returned table rows. */
function _tableWatermark(rows)
{
  return { rowCount: rows.length, sha256: _objectHash(rows) };
}

const _databaseTables = [
  "_prisma_migrations",
  "access_policies",
  "access_tokens",
  "account_budget_settings",
  "audit_log",
  "awareness_rollouts",
  "billing_accounts",
  "cluster_tenants",
  "company_doc_versions",
  "company_docs",
  "doc_merge_proposals",
  "global_budget_settings",
  "grants",
  "groups",
  "harvesting_cursors",
  "mcp_server_access_policies",
  "mcp_server_access_users",
  "mcp_server_credentials",
  "mcp_server_grants",
  "mcp_server_installs",
  "mcp_servers",
  "model_definitions",
  "model_routing_defaults",
  "mrl_eval_cases",
  "mrl_measurements",
  "org_documents",
  "org_memberships",
  "participation_events",
  "provider_api_keys",
  "provider_credentials",
  "routing_eval_cases",
  "routing_measurements",
  "routing_proposals",
  "server_metric_snapshots",
  "session_scopes",
  "skill_bundles",
  "skill_entitlements",
  "skill_promotions",
  "skills",
  "tenant_dataset_memberships",
  "tenant_litellm_keys",
  "tenant_participation",
  "tenant_workspace_docs",
  "tenants",
  "third_party_source_items",
  "third_party_sources",
  "token_usage_snapshots",
];
const _databaseTableValues = _databaseTables.map(function _table(table) { return `('public', '${table}')`; }).join(",\n    ");

const _databaseQuery = String.raw`\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
  'section', 'reader',
  'serverVersion', current_setting('server_version'),
  'transactionReadOnly', current_setting('transaction_read_only'),
  'sessionUser', session_user,
  'currentUser', current_user,
  'superuser', current_role.rolsuper,
  'createDatabase', current_role.rolcreatedb,
  'createRole', current_role.rolcreaterole,
  'replication', current_role.rolreplication,
  'bypassRowSecurity', current_role.rolbypassrls,
  'sessionSuperuser', session_role.rolsuper,
  'sessionCreateDatabase', session_role.rolcreatedb,
  'sessionCreateRole', session_role.rolcreaterole,
  'sessionReplication', session_role.rolreplication,
  'sessionBypassRowSecurity', session_role.rolbypassrls,
  'createOnDatabase', has_database_privilege(current_user, current_database(), 'CREATE'),
  'createOnPublicSchema', has_schema_privilege(current_user, 'public', 'CREATE'),
  'roleMembershipCount', (
    SELECT count(*)::integer
    FROM pg_auth_members AS membership
    WHERE membership.member = current_role.oid
  ),
  'createOnNonSystemSchemaCount', (
    SELECT count(*)::integer
    FROM pg_namespace AS namespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
      AND has_schema_privilege(current_user, namespace.oid, 'CREATE')
  ),
  'nonSystemRelationAccessCount', (
    SELECT count(*)::integer
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        relation.relowner = current_role.oid
        OR has_table_privilege(relation.oid, 'SELECT')
        OR has_table_privilege(relation.oid, 'INSERT')
        OR has_table_privilege(relation.oid, 'UPDATE')
        OR has_table_privilege(relation.oid, 'DELETE')
        OR has_table_privilege(relation.oid, 'TRUNCATE')
        OR has_table_privilege(relation.oid, 'REFERENCES')
        OR has_table_privilege(relation.oid, 'TRIGGER')
        OR has_any_column_privilege(relation.oid, 'SELECT')
        OR has_any_column_privilege(relation.oid, 'INSERT')
        OR has_any_column_privilege(relation.oid, 'UPDATE')
        OR has_any_column_privilege(relation.oid, 'REFERENCES')
      )
  )
)::text
FROM pg_roles AS current_role
JOIN pg_roles AS session_role ON session_role.rolname = session_user
WHERE current_role.rolname = current_user;
WITH requested(table_schema, table_name) AS (
  VALUES
    ${_databaseTableValues}
)
SELECT json_build_object(
  'section', 'table',
  'schema', requested.table_schema,
  'table', requested.table_name,
  'present', relation.oid IS NOT NULL,
  'approximateRows', CASE WHEN statistics.n_live_tup IS NULL THEN NULL ELSE greatest(statistics.n_live_tup, 0) END,
  'lastAnalyze', statistics.last_analyze,
  'lastAutoAnalyze', statistics.last_autoanalyze,
  'selectGranted', CASE
    WHEN relation.oid IS NULL THEN false
    ELSE has_table_privilege(format('%I.%I', requested.table_schema, requested.table_name), 'SELECT')
  END,
  'columnSelectGranted', CASE
    WHEN relation.oid IS NULL THEN false
    ELSE has_any_column_privilege(relation.oid, 'SELECT')
  END,
  'writeGranted', CASE
    WHEN relation.oid IS NULL THEN false
    ELSE has_table_privilege(format('%I.%I', requested.table_schema, requested.table_name), 'INSERT')
      OR has_table_privilege(format('%I.%I', requested.table_schema, requested.table_name), 'UPDATE')
      OR has_table_privilege(format('%I.%I', requested.table_schema, requested.table_name), 'DELETE')
      OR has_table_privilege(format('%I.%I', requested.table_schema, requested.table_name), 'TRUNCATE')
      OR has_table_privilege(format('%I.%I', requested.table_schema, requested.table_name), 'REFERENCES')
      OR has_table_privilege(format('%I.%I', requested.table_schema, requested.table_name), 'TRIGGER')
  END,
  'columnWriteGranted', CASE
    WHEN relation.oid IS NULL THEN false
    ELSE has_any_column_privilege(relation.oid, 'INSERT')
      OR has_any_column_privilege(relation.oid, 'UPDATE')
      OR has_any_column_privilege(relation.oid, 'REFERENCES')
  END,
  'ownsTable', CASE WHEN relation.oid IS NULL THEN false ELSE relation.relowner = current_role.oid END
)::text
FROM requested
JOIN pg_roles AS current_role ON current_role.rolname = current_user
LEFT JOIN pg_namespace AS namespace ON namespace.nspname = requested.table_schema
LEFT JOIN pg_class AS relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = requested.table_name
 AND relation.relkind IN ('r', 'p')
LEFT JOIN pg_stat_user_tables AS statistics ON statistics.relid = relation.oid
ORDER BY requested.table_schema, requested.table_name
;
COMMIT;
`;

/** Validate metadata-only psql output and normalize it to NDJSON. */
function _databaseEvidence(stdout)
{
  const records = [];
  for (const line of stdout.split("\n").map(function _trim(value) { return value.trim(); }).filter(Boolean))
  {
    const record = JSON.parse(line);
    if (!record || !["reader", "table"].includes(record.section)) throw new Error("psql returned an unexpected evidence section.");
    if (record.section === "table" && record.approximateRows !== null
      && (!Number.isInteger(Number(record.approximateRows)) || Number(record.approximateRows) < 0))
    {
      throw new Error("psql returned an invalid approximate row count.");
    }
    records.push(record);
  }
  const reader = records.find(function _reader(record) { return record.section === "reader"; });
  if (!reader || reader.transactionReadOnly !== "on") throw new Error("psql did not prove a read-only transaction.");
  if (typeof reader.sessionUser !== "string" || !reader.sessionUser || reader.sessionUser !== reader.currentUser)
  {
    throw new Error("psql authenticated session role differs from current role; a direct evidence-reader login is required.");
  }
  const elevatedReaderFields = ["superuser", "createDatabase", "createRole", "replication", "bypassRowSecurity", "createOnDatabase", "createOnPublicSchema"];
  if (elevatedReaderFields.some(function _elevated(field) { return reader[field] !== false; }))
  {
    throw new Error("psql service uses an elevated role; a dedicated evidence-reader role is required.");
  }
  const elevatedSessionFields = ["sessionSuperuser", "sessionCreateDatabase", "sessionCreateRole", "sessionReplication", "sessionBypassRowSecurity"];
  if (elevatedSessionFields.some(function _elevated(field) { return reader[field] !== false; }))
  {
    throw new Error("psql service authenticates with an elevated role; a dedicated evidence-reader login is required.");
  }
  if (!Number.isInteger(Number(reader.roleMembershipCount)) || Number(reader.roleMembershipCount) !== 0)
  {
    throw new Error("psql service role has inherited membership; a standalone evidence-reader role is required.");
  }
  const broadPrivilegeFields = ["createOnNonSystemSchemaCount", "nonSystemRelationAccessCount"];
  if (broadPrivilegeFields.some(function _privileged(field) {
    return !Number.isInteger(Number(reader[field])) || Number(reader[field]) !== 0;
  }))
  {
    throw new Error("psql service has access to a non-system relation or schema creation; metadata-only access is required.");
  }
  const tableRecords = records.filter(function _table(record) { return record.section === "table"; });
  const observedTables = new Set(tableRecords.filter(function _public(record) { return record.schema === "public"; }).map(function _name(record) { return record.table; }));
  if (_databaseTables.some(function _missing(table) { return !observedTables.has(table); }) || observedTables.size !== _databaseTables.length)
  {
    throw new Error("psql did not return the complete version-controlled table allowlist.");
  }
  if (tableRecords.some(function _privileged(record) {
    return record.present && (record.selectGranted !== false || record.columnSelectGranted !== false
      || record.writeGranted !== false || record.columnWriteGranted !== false || record.ownsTable !== false);
  }))
  {
    throw new Error("psql service has base-table read, write, or ownership privileges; metadata-only access is required.");
  }
  const partial = tableRecords.some(function _missingEstimate(record) { return record.present && record.approximateRows === null; });
  const ndjson = records.map(function _line(record) { return JSON.stringify(record); }).join("\n") + (records.length ? "\n" : "");
  return { ndjson, partial };
}

/** Recursively list files without following symbolic links. */
function _files(directory, base = directory)
{
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }))
  {
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Evidence output unexpectedly contains a symbolic link.");
    if (entry.isDirectory()) output.push(..._files(absolute, base));
    else if (entry.isFile()) output.push({ absolute, relative: relative(base, absolute).split(sep).join("/") });
  }
  return output;
}

/** Apply the promised permissions recursively. */
function _securePermissions(outputDir)
{
  if (typeof process.getuid !== "function") throw new Error("Evidence ownership cannot be verified on this platform.");
  const currentUserId = process.getuid();
  function _walk(directory)
  {
    const beforeDirectoryStatus = lstatSync(directory);
    if (beforeDirectoryStatus.isSymbolicLink() || !beforeDirectoryStatus.isDirectory())
    {
      throw new Error("Evidence output unexpectedly contains a symbolic link or non-directory.");
    }
    chmodSync(directory, 0o700);
    const directoryStatus = lstatSync(directory);
    if (directoryStatus.uid !== currentUserId || (directoryStatus.mode & 0o777) !== 0o700
      || realpathSync(directory) !== resolve(directory)
      || directoryStatus.dev !== beforeDirectoryStatus.dev || directoryStatus.ino !== beforeDirectoryStatus.ino)
    {
      throw new Error("Evidence directory ownership, mode, or canonical path verification failed.");
    }
    for (const entry of readdirSync(directory, { withFileTypes: true }))
    {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) _walk(absolute);
      else if (entry.isFile())
      {
        const beforeFileStatus = lstatSync(absolute);
        if (beforeFileStatus.isSymbolicLink() || !beforeFileStatus.isFile())
        {
          throw new Error("Evidence output unexpectedly contains a symbolic link or non-file.");
        }
        chmodSync(absolute, 0o600);
        const fileStatus = lstatSync(absolute);
        if (fileStatus.uid !== currentUserId || (fileStatus.mode & 0o777) !== 0o600
          || realpathSync(absolute) !== resolve(absolute)
          || fileStatus.dev !== beforeFileStatus.dev || fileStatus.ino !== beforeFileStatus.ino)
        {
          throw new Error("Evidence file ownership, mode, or canonical path verification failed.");
        }
      }
      else throw new Error("Evidence output contains an unsupported filesystem entry.");
    }
  }
  _walk(outputDir);
}

/** Main collection routine. */
function _main()
{
  process.umask(0o077);
  const options = _parseArguments(process.argv.slice(2));
  const output = _createOutputDirectory(options.outputDir);
  const outputDir = output.outputDir;
  const startedAt = _now();
  const partialMarker = _writePrivate(outputDir, ".partial", `${startedAt}\n`);
  const securedDir = _makePrivateDirectory(outputDir, "secured");
  _makePrivateDirectory(outputDir, "secured/contexts");
  _makePrivateDirectory(outputDir, "secured/databases");
  const provenanceFile = _writePrivate(outputDir, "secured/provenance.ndjson", "");
  const failuresFile = _writePrivate(outputDir, "secured/failures.ndjson", "");
  const run = _commandRunner(outputDir, provenanceFile, failuresFile);

  const revisionResult = run("repository revision", "git", ["-C", _root, "rev-parse", "HEAD"]);
  const repositoryRevision = revisionResult.ok ? revisionResult.stdout.trim() : "unknown";
  const dirtyResult = run("repository dirty state", "git", ["-C", _root, "status", "--short"]);
  const repositoryDirty = !dirtyResult.ok || dirtyResult.stdout.trim().length > 0;
  const collectorSha256 = _sha256(readFileSync(fileURLToPath(import.meta.url)));
  const toolEvidence = {};
  const kubectlVersion = run("kubectl client version", "kubectl", ["version", "--client=true", "-o", "json"]);
  toolEvidence.kubectl = kubectlVersion.ok ? kubectlVersion.stdout.trim() : "unavailable";
  const helmVersion = run("helm client version", "helm", ["version", "--template", "{{.Version}}"]);
  toolEvidence.helm = helmVersion.ok ? helmVersion.stdout.trim() : "unavailable";
  if (options.databases.length > 0)
  {
    const psqlVersion = run("psql client version", "psql", ["--version"]);
    toolEvidence.psql = psqlVersion.ok ? psqlVersion.stdout.trim() : "unavailable";
  }
  _writePrivate(outputDir, "secured/tools.json", `${JSON.stringify(toolEvidence, null, 2)}\n`);

  const contextsResult = run("configured kube contexts", "kubectl", ["config", "get-contexts", "-o", "name"]);
  const configuredContexts = contextsResult.ok
    ? contextsResult.stdout.split("\n").map(function _trim(value) { return value.trim(); }).filter(Boolean)
    : [];
  const requestedContexts = [...new Set(options.contexts)];
  const contextRecords = [];
  let reachableContexts = 0;
  let metadataQueryFailures = 0;
  let churnedSourceCount = 0;

  const queries = [
    { key: "namespaces", resource: ["namespaces"] },
    { key: "cluster-tenants", resource: ["clustertenants.opencrane.io"], authoritative: true },
    { key: "tenant-resources", resource: ["tenants.opencrane.io", "--all-namespaces"], authoritative: true },
    { key: "access-policy-resources", resource: ["accesspolicies.opencrane.io", "--all-namespaces"], authoritative: true },
    { key: "optional-mcp-server-resources", resource: ["mcpservers.opencrane.io", "--all-namespaces"] },
    { key: "optional-schedule-resources", resource: ["schedules.opencrane.io", "--all-namespaces"] },
    { key: "optional-skill-registry-resources", resource: ["skillregistries.opencrane.io", "--all-namespaces"] },
    { key: "workloads", resource: ["deployments.apps,statefulsets.apps,daemonsets.apps,cronjobs.batch,jobs.batch", "--all-namespaces"] },
    { key: "pods", resource: ["pods", "--all-namespaces"] },
    { key: "persistent-volume-claims", resource: ["persistentvolumeclaims", "--all-namespaces"] },
    { key: "network-policies", resource: ["networkpolicies.networking.k8s.io", "--all-namespaces"] },
    { key: "quotas-and-limits", resource: ["resourcequotas,limitranges", "--all-namespaces"] },
    { key: "storage-classes", resource: ["storageclasses.storage.k8s.io"] },
    { key: "cnpg-clusters", resource: ["clusters.postgresql.cnpg.io", "--all-namespaces"] },
    { key: "cnpg-backups", resource: ["backups.postgresql.cnpg.io", "--all-namespaces"] },
    { key: "cnpg-scheduled-backups", resource: ["scheduledbackups.postgresql.cnpg.io", "--all-namespaces"] },
    { key: "volume-snapshots", resource: ["volumesnapshots.snapshot.storage.k8s.io", "--all-namespaces"] },
    { key: "certificates", resource: ["certificates.cert-manager.io", "--all-namespaces"] },
    { key: "dns-endpoints", resource: ["dnsendpoints.externaldns.k8s.io", "--all-namespaces"] },
  ];

  for (const context of requestedContexts)
  {
    const contextId = `context-${_sha256(context).slice(0, 16)}`;
    const contextDirectory = `secured/contexts/${contextId}`;
    _makePrivateDirectory(outputDir, contextDirectory);
    const configured = configuredContexts.includes(context);
    const readiness = run(`context readiness ${contextId}`, "kubectl", ["--context", context, `--request-timeout=${options.requestTimeout}s`, "get", "--raw=/readyz"], { timeoutMs: (options.requestTimeout + 5) * 1000 });
    const reachable = readiness.ok && readiness.stdout.trim() === "ok";
    const contextRecord = {
      id: contextId,
      name: context,
      configured,
      reachable,
      evidenceFiles: [],
      failures: [],
      sections: { readiness: { status: reachable ? "collected" : "unavailable" } },
    };
    if (!reachable)
    {
      contextRecord.failures.push({ operation: "readiness", status: readiness.status });
      contextRecords.push(contextRecord);
      continue;
    }
    reachableContexts += 1;

    const serverVersionResult = run(`server version ${contextId}`, "kubectl", ["--context", context, "version", "-o", "json"], { timeoutMs: (options.requestTimeout + 5) * 1000 });
    const serverVersionDocument = _parseJson(serverVersionResult, `server version ${contextId}`, failuresFile);
    if (serverVersionDocument)
    {
      const versionEvidence = {
        collectedAt: _now(),
        contextId,
        clientVersion: {
          major: serverVersionDocument.clientVersion?.major ?? "",
          minor: serverVersionDocument.clientVersion?.minor ?? "",
          gitVersion: serverVersionDocument.clientVersion?.gitVersion ?? "",
          platform: serverVersionDocument.clientVersion?.platform ?? "",
        },
        serverVersion: {
          major: serverVersionDocument.serverVersion?.major ?? "",
          minor: serverVersionDocument.serverVersion?.minor ?? "",
          gitVersion: serverVersionDocument.serverVersion?.gitVersion ?? "",
          platform: serverVersionDocument.serverVersion?.platform ?? "",
        },
      };
      const versionPath = `${contextDirectory}/server-version.json`;
      _writePrivate(outputDir, versionPath, `${JSON.stringify(versionEvidence, null, 2)}\n`);
      contextRecord.evidenceFiles.push(versionPath.replace(/^secured\//u, ""));
      contextRecord.sections.serverVersion = { status: "collected", evidenceFile: versionPath.replace(/^secured\//u, "") };
    }
    else
    {
      metadataQueryFailures += 1;
      contextRecord.failures.push({ operation: "server-version", status: serverVersionResult.status });
      contextRecord.sections.serverVersion = { status: "unavailable" };
    }

    const startWatermarks = {};

    for (const query of queries)
    {
      const operation = `${query.key} ${contextId}`;
      const result = run(operation, "kubectl", ["--context", context, `--request-timeout=${options.requestTimeout}s`, "get", ...query.resource, "--server-print=true", "--no-headers"], { timeoutMs: (options.requestTimeout + 5) * 1000 });
      const rows = _serverTableRows(result, operation, failuresFile);
      if (!rows)
      {
        metadataQueryFailures += 1;
        contextRecord.failures.push({ operation: query.key, status: result.status });
        contextRecord.sections[query.key] = { status: "unavailable" };
        continue;
      }
      const evidence = { collectedAt: _now(), contextId, query: query.key, format: "server-table-v1", rowCount: rows.length, rows };
      const evidencePath = `${contextDirectory}/${query.key}.json`;
      _writePrivate(outputDir, evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
      contextRecord.evidenceFiles.push(evidencePath.replace(/^secured\//u, ""));
      contextRecord.sections[query.key] = { status: "collected", rowCount: rows.length, evidenceFile: evidencePath.replace(/^secured\//u, "") };
      if (query.authoritative) startWatermarks[query.key] = _tableWatermark(rows);
    }

    contextRecord.sections.helmReleases = {
      status: "unproven",
      reason: "Helm release state is intentionally not read because release storage may contain Kubernetes Secrets.",
    };

    const watermarkEvidence = { collectedAt: _now(), contextId, sources: {} };
    for (const query of queries.filter(function _authority(query) { return query.authoritative; }))
    {
      const operation = `${query.key} end watermark ${contextId}`;
      const result = run(operation, "kubectl", ["--context", context, `--request-timeout=${options.requestTimeout}s`, "get", ...query.resource, "--server-print=true", "--no-headers"], { timeoutMs: (options.requestTimeout + 5) * 1000 });
      const rows = _serverTableRows(result, operation, failuresFile);
      if (!rows || !startWatermarks[query.key])
      {
        metadataQueryFailures += 1;
        watermarkEvidence.sources[query.key] = { status: "unproven", start: startWatermarks[query.key] ?? null, end: null };
        continue;
      }
      const end = _tableWatermark(rows);
      const stable = startWatermarks[query.key].sha256 === end.sha256;
      if (!stable) churnedSourceCount += 1;
      watermarkEvidence.sources[query.key] = { status: stable ? "stable" : "churned", start: startWatermarks[query.key], end };
    }
    const watermarkPath = `${contextDirectory}/authority-watermarks.json`;
    _writePrivate(outputDir, watermarkPath, `${JSON.stringify(watermarkEvidence, null, 2)}\n`);
    contextRecord.evidenceFiles.push(watermarkPath.replace(/^secured\//u, ""));
    contextRecord.sections.authorityWatermarks = {
      status: Object.values(watermarkEvidence.sources).every(function _stable(source) { return source.status === "stable"; }) ? "collected" : "partial",
      evidenceFile: watermarkPath.replace(/^secured\//u, ""),
    };
    contextRecords.push(contextRecord);
  }
  _writePrivate(outputDir, "secured/contexts.json", `${JSON.stringify({ configuredContexts, requestedContexts, contexts: contextRecords }, null, 2)}\n`);

  _writePrivate(outputDir, "secured/database-query.sql", _databaseQuery);
  const databaseRecords = [];
  let successfulDatabases = 0;
  for (const database of options.databases)
  {
    const databaseId = `database-${_sha256(`${database.label}\0${database.service}`).slice(0, 16)}`;
    const environment = {
      ...process.env,
      PGCONNECT_TIMEOUT: String(options.requestTimeout),
      PGOPTIONS: `-c default_transaction_read_only=on -c statement_timeout=${options.requestTimeout * 1000} -c lock_timeout=2000`,
    };
    const result = run(`metadata-only database evidence ${databaseId}`, "psql", [
      `service=${database.service}`,
      "--no-psqlrc",
      "--no-align",
      "--tuples-only",
      "--quiet",
      "--set=ON_ERROR_STOP=1",
    ], {
      env: environment,
      input: _databaseQuery,
      timeoutMs: (options.requestTimeout + 5) * 1000,
      provenanceEnvironment: {
        PGCONNECT_TIMEOUT: environment.PGCONNECT_TIMEOUT,
        PGOPTIONS: environment.PGOPTIONS,
      },
    });
    const record = { id: databaseId, label: database.label, service: database.service, status: "unavailable", evidenceFile: "", failureStatus: null };
    if (result.ok)
    {
      try
      {
        const evidence = _databaseEvidence(result.stdout);
        const evidencePath = `secured/databases/${databaseId}.ndjson`;
        _writePrivate(outputDir, evidencePath, evidence.ndjson);
        record.status = evidence.partial ? "partial" : "collected";
        record.evidenceFile = evidencePath.replace(/^secured\//u, "");
        if (!evidence.partial) successfulDatabases += 1;
      }
      catch (error)
      {
        record.failureStatus = "invalid-output";
        _appendRecord(failuresFile, { operation: `metadata-only database evidence ${databaseId}`, status: "invalid-output", stderr: String(error), truncated: false });
      }
    }
    else
    {
      record.failureStatus = result.status;
    }
    databaseRecords.push(record);
  }
  _writePrivate(outputDir, "secured/databases.json", `${JSON.stringify(databaseRecords, null, 2)}\n`);

  const incompleteness = [
    "configured kube contexts cannot prove that no unconfigured estate exists",
    "Secret and ConfigMap resources and their values are intentionally never requested",
    "server-returned Kubernetes tables omit fields that are not exposed by their approved printer columns",
    "metadata-only SQL uses catalog estimates and does not prove exact row counts, user activity, semantic value, exportability, or owner-approved disposition",
    "Helm release state is intentionally unproven because release storage may contain Kubernetes Secrets",
    "owner approvals, retention, maintenance windows, rollback requirements, staffing, and sign-off authority require external decisions",
    "volume contents, transcript bytes, uploaded artifacts, memory payloads, and upstream API behavior require separately approved evidence procedures",
  ];
  if (contextsResult.ok === false) incompleteness.push("configured kube contexts could not be enumerated");
  if (requestedContexts.some(function _unconfigured(context) { return !configuredContexts.includes(context); })) incompleteness.push("one or more requested contexts were not present in the configured kube contexts");
  if (options.contexts.length > 0 && configuredContexts.some(function _notRequested(context) { return !requestedContexts.includes(context); })) incompleteness.push("the caller selected only a subset of configured kube contexts");
  if (reachableContexts < requestedContexts.length) incompleteness.push("one or more requested kube contexts were unreachable");
  if (metadataQueryFailures > 0) incompleteness.push("one or more cluster metadata queries failed");
  if (options.databases.length === 0) incompleteness.push("no libpq database services were supplied for metadata-only evidence");
  if (successfulDatabases < options.databases.length) incompleteness.push("one or more database evidence targets failed or lacked the required metadata-only access");
  if (churnedSourceCount > 0) incompleteness.push("one or more authoritative Kubernetes sources changed between start and end watermarks");

  const failureRecordCount = readFileSync(failuresFile, "utf8").split("\n").filter(Boolean).length;
  if (failureRecordCount > 0) incompleteness.push("one or more collector commands or output validations failed");

  const securedSummary = {
    schemaVersion: 1,
    collectorVersion: _collectorVersion,
    querySetVersion: _querySetVersion,
    collectorSha256,
    startedAt,
    completedAt: _now(),
    repositoryRevision,
    repositoryDirty,
    configuredContexts,
    requestedContexts,
    reachableContextCount: reachableContexts,
    unreachableContextCount: Math.max(0, requestedContexts.length - reachableContexts),
    metadataQueryFailureCount: metadataQueryFailures,
    churnedSourceCount,
    failureRecordCount,
    databaseTargetCount: options.databases.length,
    successfulDatabaseCount: successfulDatabases,
    collectorRunStatus: failureRecordCount === 0 && successfulDatabases === options.databases.length && churnedSourceCount === 0 ? "completed" : "completed-with-failures",
    evidenceCompleteness: "incomplete",
    incompleteness,
    prohibitedCollection: ["Kubernetes Secret resources", "Kubernetes ConfigMap resources", "Secret values", "ConfigMap values", "row contents", "logs", "events", "Helm release state", "Helm values", "Helm manifests"],
  };
  _writePrivate(outputDir, "secured/run-summary.json", `${JSON.stringify(securedSummary, null, 2)}\n`);

  const securedFiles = _files(securedDir).sort(function _sort(left, right) { return left.relative.localeCompare(right.relative); });
  const fileManifest = {
    schemaVersion: 1,
    generatedAt: _now(),
    files: securedFiles.map(function _file(file) {
      const bytes = readFileSync(file.absolute);
      return { path: file.relative, bytes: statSync(file.absolute).size, sha256: _sha256(bytes) };
    }),
  };
  const securedManifestPath = _writePrivate(outputDir, "secured/file-manifest.json", `${JSON.stringify(fileManifest, null, 2)}\n`);
  const securedManifestSha256 = _sha256(readFileSync(securedManifestPath));
  const publicManifest = {
    schemaVersion: 1,
    collectorVersion: _collectorVersion,
    querySetVersion: _querySetVersion,
    collectorSha256,
    startedAt,
    completedAt: _now(),
    repositoryRevision,
    repositoryDirty,
    packWriteStatus: "complete-when-.complete-marker-present",
    evidenceCompleteness: "incomplete",
    securedFileManifestSha256: securedManifestSha256,
    securityBoundary: "Source scopes, counts, reachability, failures, and detailed evidence stay in the mode-0700 secured directory; Kubernetes collection used server-returned tables and requested no full objects, Secret resources, ConfigMap resources, or credential values.",
  };
  const publicManifestPath = _writePrivate(outputDir, "public-manifest.json", `${JSON.stringify(publicManifest, null, 2)}\n`);
  const publicManifestSha256 = _sha256(readFileSync(publicManifestPath));
  _writePrivate(outputDir, "public-manifest.sha256", `${publicManifestSha256}  public-manifest.json\n`);
  _securePermissions(outputDir);
  _verifyEvidenceEnclave(outputDir, output.reviewsIdentity, output.targetIdentity);
  const completeMarker = _inside(outputDir, ".complete");
  if (lstatSync(completeMarker, { throwIfNoEntry: false }) || !_isGitIgnored(completeMarker))
  {
    throw new Error("The completion marker is not exclusively available and covered by the tracked .agent-reviews ignore rule.");
  }
  renameSync(partialMarker, completeMarker);

  process.stdout.write(`R0 estate evidence pack written to ${outputDir}\n`);
  process.stdout.write(`Public manifest SHA-256: ${publicManifestSha256}\n`);
}

try
{
  _main();
}
catch (error)
{
  process.stderr.write(`collect-r0-estate-evidence: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
