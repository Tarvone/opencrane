#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COLLECTOR="$ROOT/scripts/collect-r0-estate-evidence.mjs"
TMP_DIR_REQUESTED="$(mktemp -d)"
TMP_DIR="$(cd "$TMP_DIR_REQUESTED" && pwd -P)"
FAKE_BIN="$TMP_DIR/bin"
COMMAND_LOG="$TMP_DIR/commands.log"
PSQL_STDIN="$TMP_DIR/psql-stdin.sql"
REVIEWS_ROOT="$ROOT/.agent-reviews"
TEST_PREFIX="collector-test-$$-$RANDOM"
REVIEWS_ROOT_CREATED=0

if [[ ! -e "$REVIEWS_ROOT" ]]; then
  mkdir -m 0700 "$REVIEWS_ROOT"
  REVIEWS_ROOT_CREATED=1
fi
[[ ! -L "$REVIEWS_ROOT" && -d "$REVIEWS_ROOT" ]] || { printf 'R0 estate evidence test requires a real .agent-reviews directory\n' >&2; exit 1; }
node - "$REVIEWS_ROOT" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const reviewsRoot = process.argv[2];
const stat = fs.lstatSync(reviewsRoot);
if ((stat.mode & 0o777) !== 0o700) throw new Error("R0 estate evidence test requires .agent-reviews mode 0700");
if (stat.uid !== process.getuid()) throw new Error("R0 estate evidence test requires current-user ownership");
if (fs.realpathSync(reviewsRoot) !== path.resolve(reviewsRoot)) throw new Error("R0 estate evidence test requires a canonical path");
NODE

cleanup()
{
  chmod 0700 "$REVIEWS_ROOT" 2>/dev/null || true
  for entry in "$REVIEWS_ROOT/$TEST_PREFIX-"*; do
    [[ -e "$entry" || -L "$entry" ]] && rm -rf -- "$entry"
  done
  if [[ "$REVIEWS_ROOT_CREATED" == "1" ]]; then
    rmdir "$REVIEWS_ROOT" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail()
{
  printf 'R0 estate evidence test failed: %s\n' "$1" >&2
  exit 1
}

expect_failure()
{
  local expected="$1"
  shift
  local output status
  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e
  [[ $status -ne 0 ]] || fail "command unexpectedly succeeded: $*"
  grep -Fq -- "$expected" <<<"$output" || fail "failure did not contain '$expected': $output"
}

mkdir -p "$FAKE_BIN"

cat >"$FAKE_BIN/kubectl" <<'FAKE_KUBECTL'
#!/usr/bin/env bash
set -euo pipefail
printf 'kubectl' >>"$FAKE_COMMAND_LOG"
printf '\t%s' "$@" >>"$FAKE_COMMAND_LOG"
printf '\n' >>"$FAKE_COMMAND_LOG"

if [[ -n "${FAKE_INTERRUPT_MARKER:-}" && ! -e "$FAKE_INTERRUPT_MARKER" ]]; then
  : >"$FAKE_INTERRUPT_MARKER"
  kill -TERM "$PPID"
  exit 143
fi

make_replacement_output()
{
  mkdir -m 0700 "$FAKE_REPLACE_OUTPUT_DIR"
  mkdir -m 0700 "$FAKE_REPLACE_OUTPUT_DIR/secured" "$FAKE_REPLACE_OUTPUT_DIR/secured/contexts" "$FAKE_REPLACE_OUTPUT_DIR/secured/databases"
  : >"$FAKE_REPLACE_OUTPUT_DIR/secured/provenance.ndjson"
  : >"$FAKE_REPLACE_OUTPUT_DIR/secured/failures.ndjson"
  chmod 0600 "$FAKE_REPLACE_OUTPUT_DIR/secured/provenance.ndjson" "$FAKE_REPLACE_OUTPUT_DIR/secured/failures.ndjson"
}

if [[ -n "${FAKE_REPLACE_REVIEWS_ROOT:-}" && ! -e "${FAKE_REPLACEMENT_MARKER:-}" ]]; then
  mv "$FAKE_REPLACE_REVIEWS_ROOT" "$FAKE_REPLACE_REVIEWS_ROOT_SAVED"
  mkdir -m 0700 "$FAKE_REPLACE_REVIEWS_ROOT"
  make_replacement_output
  : >"$FAKE_REPLACEMENT_MARKER"
elif [[ -n "${FAKE_REPLACE_OUTPUT_DIR:-}" && ! -e "${FAKE_REPLACE_OUTPUT_DIR}.replacement-done" ]]; then
  mv "$FAKE_REPLACE_OUTPUT_DIR" "${FAKE_REPLACE_OUTPUT_DIR}-original"
  make_replacement_output
  : >"${FAKE_REPLACE_OUTPUT_DIR}.replacement-done"
fi

if [[ " $* " == *" secret "* || " $* " == *" secrets "* || " $* " == *" configmap "* || " $* " == *" configmaps "* ]]; then
  printf 'TOP_SECRET_SHOULD_NEVER_BE_READ\n'
  exit 99
fi

if [[ " ${*} " == *" version "* ]]; then
  printf '{"clientVersion":{"major":"1","minor":"35","gitVersion":"v-fixture","platform":"fixture"},"serverVersion":{"major":"1","minor":"34","gitVersion":"v-server-fixture","platform":"fixture"}}\n'
  exit 0
fi
if [[ "${1:-}" == "config" && "${2:-}" == "get-contexts" ]]; then
  printf '%s\n' 'fixture-context' 'unreachable-context' '../../tenant-alpha'
  exit 0
fi

context=""
resource=""
verb=""
for ((index = 1; index <= $#; index += 1)); do
  argument="${!index}"
  if [[ "$argument" == "--context" ]]; then
    next=$((index + 1))
    context="${!next}"
  fi
  if [[ "$argument" == "get" ]]; then
    verb="get"
    next=$((index + 1))
    resource="${!next}"
  fi
done
[[ "$verb" == "get" ]] || { printf 'fake kubectl rejected non-read verb\n' >&2; exit 90; }

if [[ "$resource" == "--raw=/readyz" ]]; then
  if [[ "$context" == "unreachable-context" ]]; then
    printf 'fixture context unreachable\n' >&2
    exit 1
  fi
  printf 'ok\n'
  exit 0
fi

if [[ " ${*} " == *" -o "* || " ${*} " == *" --output "* || " ${*} " == *" --output="* ]]; then
  printf 'fake kubectl rejected a full-object output request\n' >&2
  exit 98
fi
if [[ " ${*} " != *" --server-print=true "* || " ${*} " != *" --no-headers "* ]]; then
  printf 'fake kubectl requires a server-returned metadata table\n' >&2
  exit 97
fi

case "$resource" in
  namespaces)
    printf '%s\n' 'tenant-alpha-ns   Active   100d'
    ;;
  clustertenants.opencrane.io)
    printf '%s\n' 'tenant-alpha   Alpha Team   shared   ready   tenant-alpha-ns   100d'
    ;;
  tenants.opencrane.io)
    printf '%s\n' 'tenant-alpha-ns   tenant-alpha-agent   Agent   Team Alpha   Running   agent.example.test   99d'
    ;;
  accesspolicies.opencrane.io|schedules.opencrane.io|skillregistries.opencrane.io)
    :
    ;;
  mcpservers.opencrane.io)
    printf 'fixture CRD is not installed\n' >&2
    exit 1
    ;;
  deployments.apps,statefulsets.apps,daemonsets.apps,cronjobs.batch,jobs.batch)
    printf '%s\n' 'deployment.apps/agent-runtime   1/1   1   1   98d'
    ;;
  pods)
    printf '%s\n' 'tenant-alpha-ns   agent-runtime-pod   1/1   Running   0   98d'
    ;;
  persistentvolumeclaims)
    printf '%s\n' 'tenant-alpha-ns   agent-state   Bound   volume-1   1Gi   RWO   private-rwo   98d'
    ;;
  networkpolicies.networking.k8s.io|resourcequotas,limitranges|storageclasses.storage.k8s.io|clusters.postgresql.cnpg.io|backups.postgresql.cnpg.io|scheduledbackups.postgresql.cnpg.io|volumesnapshots.snapshot.storage.k8s.io|certificates.cert-manager.io|dnsendpoints.externaldns.k8s.io)
    :
    ;;
  *)
    printf 'fixture has no response for resource: %s\n' "$resource" >&2
    exit 91
    ;;
esac
FAKE_KUBECTL

cat >"$FAKE_BIN/helm" <<'FAKE_HELM'
#!/usr/bin/env bash
set -euo pipefail
printf 'helm' >>"$FAKE_COMMAND_LOG"
printf '\t%s' "$@" >>"$FAKE_COMMAND_LOG"
printf '\n' >>"$FAKE_COMMAND_LOG"
if [[ " ${*} " == *" version "* ]]; then
  printf 'v-fixture\n'
  exit 0
fi
printf 'fake helm rejected state read\n' >&2
exit 90
FAKE_HELM

cat >"$FAKE_BIN/psql" <<'FAKE_PSQL'
#!/usr/bin/env bash
set -euo pipefail
printf 'psql' >>"$FAKE_COMMAND_LOG"
printf '\t%s' "$@" >>"$FAKE_COMMAND_LOG"
printf '\n' >>"$FAKE_COMMAND_LOG"
if [[ " ${*} " == *" --version "* ]]; then
  printf 'psql (PostgreSQL) fixture\n'
  exit 0
fi
query="$(cat)"
printf '%s' "$query" >"$FAKE_PSQL_STDIN"
grep -Fq 'READ ONLY' <<<"$query" || { printf 'query is not read-only\n' >&2; exit 92; }
grep -Fq 'pg_stat_user_tables' <<<"$query" || { printf 'query lacks metadata-only relation inventory\n' >&2; exit 93; }
if [[ "${FAKE_PSQL_FAIL:-0}" == "1" ]]; then
  printf 'fixture psql unavailable\n' >&2
  exit 1
fi
superuser=false
[[ "${FAKE_PSQL_ELEVATED:-0}" == "1" ]] && superuser=true
session_user=evidence_reader
session_superuser=false
if [[ "${FAKE_PSQL_SESSION_ELEVATED:-0}" == "1" ]]; then
  session_user=admin
  session_superuser=true
fi
[[ "${FAKE_PSQL_SESSION_FLAGS:-0}" == "1" ]] && session_superuser=true
membership_count=0
[[ "${FAKE_PSQL_MEMBERSHIP:-0}" == "1" ]] && membership_count=1
global_access_count=0
[[ "${FAKE_PSQL_GLOBAL_ACCESS:-0}" == "1" ]] && global_access_count=1
printf '%s\n' "{\"section\":\"reader\",\"serverVersion\":\"16.3\",\"transactionReadOnly\":\"on\",\"sessionUser\":\"${session_user}\",\"currentUser\":\"evidence_reader\",\"superuser\":${superuser},\"createDatabase\":false,\"createRole\":false,\"replication\":false,\"bypassRowSecurity\":false,\"sessionSuperuser\":${session_superuser},\"sessionCreateDatabase\":false,\"sessionCreateRole\":false,\"sessionReplication\":false,\"sessionBypassRowSecurity\":false,\"createOnDatabase\":false,\"createOnPublicSchema\":false,\"roleMembershipCount\":${membership_count},\"createOnNonSystemSchemaCount\":0,\"nonSystemRelationAccessCount\":${global_access_count}}"
while IFS= read -r table; do
  if [[ "$table" == "session_scopes" ]]; then
    select_granted=false
    column_select_granted=false
    write_granted=false
    [[ "${FAKE_PSQL_BASE_SELECT:-0}" == "1" ]] && select_granted=true
    [[ "${FAKE_PSQL_COLUMN_SELECT:-0}" == "1" ]] && column_select_granted=true
    [[ "${FAKE_PSQL_WRITE:-0}" == "1" ]] && write_granted=true
    printf '{"section":"table","schema":"public","table":"%s","present":true,"approximateRows":7,"lastAnalyze":null,"lastAutoAnalyze":null,"selectGranted":%s,"columnSelectGranted":%s,"writeGranted":%s,"columnWriteGranted":false,"ownsTable":false}\n' "$table" "$select_granted" "$column_select_granted" "$write_granted"
  else
    printf '{"section":"table","schema":"public","table":"%s","present":false,"approximateRows":null,"lastAnalyze":null,"lastAutoAnalyze":null,"selectGranted":false,"columnSelectGranted":false,"writeGranted":false,"columnWriteGranted":false,"ownsTable":false}\n' "$table"
  fi
done < <(grep -Eo "\('public', '[^']+'\)" <<<"$query" | sed -E "s/\('public', '([^']+)'\)/\1/" | sort -u)
FAKE_PSQL

chmod 0700 "$FAKE_BIN/kubectl" "$FAKE_BIN/helm" "$FAKE_BIN/psql"
export FAKE_COMMAND_LOG="$COMMAND_LOG"
export FAKE_PSQL_STDIN="$PSQL_STDIN"
export PATH="$FAKE_BIN:$PATH"

expect_failure '--output-dir must be an absolute path' node "$COLLECTOR" --output-dir relative/path
expect_failure 'At least one explicit --context is required' node "$COLLECTOR" --output-dir "$TMP_DIR/no-context"

if [[ "$REVIEWS_ROOT_CREATED" == "1" ]]; then
  rmdir "$REVIEWS_ROOT"
  expect_failure 'must pre-exist with mode 0700' node "$COLLECTOR" --output-dir "$REVIEWS_ROOT/$TEST_PREFIX-missing-root" --context fixture-context --allow-local-agent-reviews
  symlink_target="$TMP_DIR/symlink-reviews-root"
  mkdir -m 0700 "$symlink_target"
  ln -s "$symlink_target" "$REVIEWS_ROOT"
  expect_failure 'must be canonical, mode 0700' node "$COLLECTOR" --output-dir "$REVIEWS_ROOT/$TEST_PREFIX-symlink-root" --context fixture-context --allow-local-agent-reviews
  unlink "$REVIEWS_ROOT"
  mkdir -m 0700 "$REVIEWS_ROOT"
fi

repo_output="$ROOT/$TEST_PREFIX-arbitrary-repo-output"
[[ ! -e "$repo_output" ]] || fail "random repository-local test path already exists"
expect_failure 'direct safe-named child' node "$COLLECTOR" --output-dir "$repo_output" --context fixture-context --allow-local-agent-reviews
[[ ! -e "$repo_output" ]] || fail "collector created a repository-local output directory"

primary_root="$(dirname "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)")"
if [[ "$primary_root" != "$ROOT" ]]; then
  primary_output="$primary_root/.agent-reviews/$TEST_PREFIX-primary-output"
  [[ ! -e "$primary_output" ]] || fail "random primary-repository test path already exists"
  expect_failure 'active worktree' node "$COLLECTOR" --output-dir "$primary_output" --context fixture-context --allow-local-agent-reviews
  [[ ! -e "$primary_output" ]] || fail "collector created output in the primary repository"
fi

nested_parent="$REVIEWS_ROOT/$TEST_PREFIX-nested"
mkdir -m 0700 "$nested_parent"
expect_failure 'direct safe-named child' node "$COLLECTOR" --output-dir "$nested_parent/evidence" --context fixture-context --allow-local-agent-reviews

missing_opt_in="$REVIEWS_ROOT/$TEST_PREFIX-missing-opt-in"
expect_failure '--allow-local-agent-reviews is required' node "$COLLECTOR" --output-dir "$missing_opt_in" --context fixture-context

noncanonical_output="$REVIEWS_ROOT/./$TEST_PREFIX-noncanonical"
expect_failure 'canonical absolute path' node "$COLLECTOR" --output-dir "$noncanonical_output" --context fixture-context --allow-local-agent-reviews

existing_output="$REVIEWS_ROOT/$TEST_PREFIX-existing"
mkdir "$existing_output"
expect_failure '--output-dir must not already exist' node "$COLLECTOR" --output-dir "$existing_output" --context fixture-context --allow-local-agent-reviews

dangling_output="$REVIEWS_ROOT/$TEST_PREFIX-dangling-output"
ln -s "$TMP_DIR/does-not-exist" "$dangling_output"
expect_failure '--output-dir must not already exist' node "$COLLECTOR" --output-dir "$dangling_output" --context fixture-context --allow-local-agent-reviews

insecure_output="$REVIEWS_ROOT/$TEST_PREFIX-insecure"
chmod 0755 "$REVIEWS_ROOT"
expect_failure 'mode 0700' node "$COLLECTOR" --output-dir "$insecure_output" --context fixture-context --allow-local-agent-reviews
chmod 0700 "$REVIEWS_ROOT"

invalid_database_output="$TMP_DIR/invalid-database"
expect_failure 'connection strings and credentials are forbidden' node "$COLLECTOR" --output-dir "$invalid_database_output" --database 'silo=postgresql://user:secret@example/db'
[[ ! -e "$invalid_database_output" ]] || fail "collector created output before rejecting a connection string"
expect_failure 'Each --database label must be unique' node "$COLLECTOR" --output-dir "$REVIEWS_ROOT/$TEST_PREFIX-duplicate-database" --context fixture-context --allow-local-agent-reviews --database silo=first --database silo=second

output="$REVIEWS_ROOT/$TEST_PREFIX-evidence"
node "$COLLECTOR" --output-dir "$output" \
  --allow-local-agent-reviews \
  --context fixture-context \
  --context unreachable-context \
  --context ../../tenant-alpha \
  --database silo=fixture-service \
  --request-timeout 2 >/dev/null

[[ -f "$output/public-manifest.json" ]] || fail "public manifest missing"
[[ -f "$output/public-manifest.sha256" ]] || fail "public manifest hash missing"
[[ -f "$output/secured/file-manifest.json" ]] || fail "secured file manifest missing"
[[ -d "$output/secured" ]] || fail "secured directory missing"
[[ -f "$output/.complete" && ! -e "$output/.partial" ]] || fail "collector did not atomically mark a complete run"
git -C "$ROOT" check-ignore --quiet --no-index -- "$output" || fail "evidence output directory is not Git-ignored"
git -C "$ROOT" check-ignore --quiet --no-index -- "$output/secured/file-manifest.json" || fail "nested evidence file is not Git-ignored"
if git -C "$ROOT" ls-files --error-unmatch -- "$output/public-manifest.json" >/dev/null 2>&1; then
  fail "evidence pack file is tracked"
fi
if git -C "$ROOT" add --dry-run -- "$output/public-manifest.json" >"$TMP_DIR/git-add-dry-run.log" 2>&1; then
  fail "normal Git staging accepted an evidence pack file"
fi
grep -Fq '"evidenceCompleteness": "incomplete"' "$output/public-manifest.json" || fail "public manifest did not fail closed on completeness"
grep -Fq 'one or more requested kube contexts were unreachable' "$output/secured/run-summary.json" || fail "unreachable context was not recorded"
grep -Fq 'tenant-alpha' "$output/secured/contexts.json" || fail "secured context evidence lost exact identities"
grep -RFq '"approximateRows":7' "$output/secured/databases" || fail "metadata-only database evidence missing"
grep -Fq 'unreachable-context' "$output/secured/contexts.json" || fail "unreachable configured context missing from secured detail"
grep -Fq 'fixture context unreachable' "$output/secured/failures.ndjson" || fail "failure detail missing"
grep -Fq '"command":["kubectl"' "$output/secured/provenance.ndjson" || fail "exact command provenance missing"
grep -Fq 'default_transaction_read_only=on' "$output/secured/provenance.ndjson" || fail "read-only psql environment provenance missing"
grep -Fq 'READ ONLY' "$PSQL_STDIN" || fail "psql query was not read-only"
grep -Fq "('public', 'session_scopes')" "$PSQL_STDIN" || fail "psql query did not use the version-controlled table allowlist"
grep -Fq 'pg_stat_user_tables' "$PSQL_STDIN" || fail "psql query did not use metadata-only relation statistics"
grep -Fq "'sessionUser', session_user" "$PSQL_STDIN" || fail "psql query did not inspect the authenticated session role"
grep -Fq "'currentUser', current_user" "$PSQL_STDIN" || fail "psql query did not inspect the effective current role"
if grep -Fq '\gexec' "$PSQL_STDIN" || grep -Eq 'FROM[[:space:]]+public\.' "$PSQL_STDIN"; then
  fail "psql query attempted a base-table read"
fi
grep -Fq 'tenant-resources.json' "$output/secured/contexts.json" || fail "Tenant evidence was lost when an optional CRD was unavailable"
grep -Fq 'access-policy-resources.json' "$output/secured/contexts.json" || fail "AccessPolicy evidence was lost when an optional CRD was unavailable"
grep -Fq 'fixture CRD is not installed' "$output/secured/failures.ndjson" || fail "unavailable optional CRD was not recorded"

for forbidden in 'tenant-alpha' 'fixture-context' 'owner@example.test' 'credential-secret' 'TOP_SECRET_SHOULD_NEVER_BE_READ'; do
  if grep -Fq "$forbidden" "$output/public-manifest.json" "$output/public-manifest.sha256"; then
    fail "public-safe files exposed $forbidden"
  fi
done
for secured_only_field in 'configuredContextCount' 'requestedContextCount' 'reachableContextCount' 'unreachableContextCount' 'databaseTargetCount' 'successfulDatabaseCount' 'collectorRunStatus' 'incompleteness'; do
  if grep -Fq "$secured_only_field" "$output/public-manifest.json"; then
    fail "public-safe manifest exposed secured-only field $secured_only_field"
  fi
done
if grep -RFq 'owner@example.test' "$output" || grep -RFq 'credential-secret' "$output" || grep -RFq 'TOP_SECRET_SHOULD_NEVER_BE_READ' "$output"; then
  fail "collector persisted a source field or Secret-like value that should only have been hashed or omitted"
fi
if grep -Eiq '(^|[[:space:],./])secrets?([[:space:],./]|$)' "$COMMAND_LOG"; then
  fail "collector requested a Kubernetes Secret resource"
fi
if grep -Eiq '(^|[[:space:],./])configmaps?([[:space:],./]|$)' "$COMMAND_LOG"; then
  fail "collector requested a Kubernetes ConfigMap resource"
fi
if grep -Eq $'^helm\t.*\tlist(\t|$)' "$COMMAND_LOG"; then
  fail "collector requested Helm release state"
fi
[[ ! -e "$REVIEWS_ROOT/tenant-alpha" ]] || fail "context name escaped the secured context directory"

node - "$output" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const currentUser = process.getuid();
function walk(entry) {
  const stat = fs.lstatSync(entry);
  const mode = stat.mode & 0o777;
  if (stat.isSymbolicLink()) throw new Error(`unexpected symlink: ${entry}`);
  if (stat.uid !== currentUser) throw new Error(`entry is not current-user-owned: ${entry}`);
  if (fs.realpathSync(entry) !== path.resolve(entry)) throw new Error(`entry is not canonical: ${entry}`);
  if (stat.isDirectory()) {
    if (mode !== 0o700) throw new Error(`directory mode is ${mode.toString(8)}, expected 700: ${entry}`);
    for (const child of fs.readdirSync(entry)) walk(path.join(entry, child));
  } else if (stat.isFile()) {
    if (mode !== 0o600) throw new Error(`file mode is ${mode.toString(8)}, expected 600: ${entry}`);
  } else {
    throw new Error(`unsupported filesystem entry: ${entry}`);
  }
}
walk(root);
NODE

manifest_hash="$(cut -d ' ' -f1 "$output/public-manifest.sha256")"
actual_hash="$(shasum -a 256 "$output/public-manifest.json" | cut -d ' ' -f1)"
[[ "$manifest_hash" == "$actual_hash" ]] || fail "public manifest hash does not verify"

unignored_bin="$TMP_DIR/unignored-bin"
mkdir "$unignored_bin"
real_git="$(command -v git)"
cat >"$unignored_bin/git" <<'FAKE_GIT'
#!/usr/bin/env bash
if [[ " $* " == *" check-ignore "* ]]; then
  exit 1
fi
exec "$REAL_GIT" "$@"
FAKE_GIT
chmod 0700 "$unignored_bin/git"
unignored_output="$REVIEWS_ROOT/$TEST_PREFIX-unignored"
expect_failure 'fully Git-ignored' env REAL_GIT="$real_git" PATH="$unignored_bin:$PATH" node "$COLLECTOR" --output-dir "$unignored_output" --context fixture-context --allow-local-agent-reviews
[[ ! -e "$unignored_output" ]] || fail "collector created an unignored evidence output"

masking_bin="$TMP_DIR/masking-bin"
mkdir "$masking_bin"
cat >"$masking_bin/git" <<'FAKE_MASKING_GIT'
#!/usr/bin/env bash
if [[ " $* " == *" check-ignore "* ]]; then
  last_argument="${!#}"
  printf '%s:1:/.agent-reviews/\t%s\n' "$FAKE_IGNORE_SOURCE" "$last_argument"
  exit 0
fi
exec "$REAL_GIT" "$@"
FAKE_MASKING_GIT
chmod 0700 "$masking_bin/git"

global_masked_output="$REVIEWS_ROOT/$TEST_PREFIX-global-masked"
expect_failure 'fully Git-ignored' env \
  REAL_GIT="$real_git" \
  FAKE_IGNORE_SOURCE="$TMP_DIR/global-excludes" \
  PATH="$masking_bin:$PATH" \
  node "$COLLECTOR" --output-dir "$global_masked_output" --context fixture-context --allow-local-agent-reviews
[[ ! -e "$global_masked_output" ]] || fail "collector accepted a global-excludes masking source"

git_info_masked_output="$REVIEWS_ROOT/$TEST_PREFIX-git-info-masked"
expect_failure 'fully Git-ignored' env \
  REAL_GIT="$real_git" \
  FAKE_IGNORE_SOURCE=".git/info/exclude" \
  PATH="$masking_bin:$PATH" \
  node "$COLLECTOR" --output-dir "$git_info_masked_output" --context fixture-context --allow-local-agent-reviews
[[ ! -e "$git_info_masked_output" ]] || fail "collector accepted a .git/info/exclude masking source"

late_ignore_bin="$TMP_DIR/late-ignore-bin"
mkdir "$late_ignore_bin"
cat >"$late_ignore_bin/git" <<'FAKE_LATE_IGNORE_GIT'
#!/usr/bin/env bash
if [[ " $* " == *" check-ignore "* ]]; then
  last_argument="${!#}"
  if [[ "$last_argument" == */public-manifest.sha256 ]]; then
    exit 1
  fi
fi
exec "$REAL_GIT" "$@"
FAKE_LATE_IGNORE_GIT
chmod 0700 "$late_ignore_bin/git"
late_ignore_output="$REVIEWS_ROOT/$TEST_PREFIX-late-ignore"
expect_failure 'no longer covered' env \
  REAL_GIT="$real_git" \
  PATH="$late_ignore_bin:$PATH" \
  node "$COLLECTOR" --output-dir "$late_ignore_output" --context fixture-context --allow-local-agent-reviews --request-timeout 2
[[ -f "$late_ignore_output/.partial" ]] || fail "late ignore loss removed the partial marker"
[[ ! -e "$late_ignore_output/.complete" ]] || fail "collector completed after an individual entry lost ignore coverage"

interrupted_output="$REVIEWS_ROOT/$TEST_PREFIX-interrupted"
interrupt_marker="$TMP_DIR/interrupted.marker"
set +e
FAKE_INTERRUPT_MARKER="$interrupt_marker" bash -c 'node "$@"; status=$?; exit "$status"' _ \
  "$COLLECTOR" \
  --output-dir "$interrupted_output" \
  --context fixture-context \
  --allow-local-agent-reviews \
  --request-timeout 2 >/dev/null 2>&1
interrupt_status=$?
set -e
[[ "$interrupt_status" -ne 0 ]] || fail "interrupted collector unexpectedly succeeded"
[[ -f "$interrupt_marker" ]] || fail "interruption fixture did not execute"
[[ -f "$interrupted_output/.partial" ]] || fail "interrupted collection did not retain its partial marker"
[[ ! -e "$interrupted_output/.complete" ]] || fail "interrupted collection wrote a complete marker"

replaced_output="$REVIEWS_ROOT/$TEST_PREFIX-replaced"
expect_failure 'evidence output identity' env FAKE_REPLACE_OUTPUT_DIR="$replaced_output" node "$COLLECTOR" --output-dir "$replaced_output" --context fixture-context --allow-local-agent-reviews --request-timeout 2
[[ ! -e "$replaced_output/.complete" ]] || fail "collector completed after its output directory identity was replaced"

if [[ "$REVIEWS_ROOT_CREATED" == "1" ]]; then
  replaced_parent_output="$REVIEWS_ROOT/$TEST_PREFIX-replaced-parent"
  saved_reviews_root="$TMP_DIR/saved-reviews-root"
  replacement_marker="$TMP_DIR/replaced-parent.marker"
  expect_failure 'enclave identity' env \
    FAKE_REPLACE_REVIEWS_ROOT="$REVIEWS_ROOT" \
    FAKE_REPLACE_REVIEWS_ROOT_SAVED="$saved_reviews_root" \
    FAKE_REPLACE_OUTPUT_DIR="$replaced_parent_output" \
    FAKE_REPLACEMENT_MARKER="$replacement_marker" \
    node "$COLLECTOR" --output-dir "$replaced_parent_output" --context fixture-context --allow-local-agent-reviews --request-timeout 2
  [[ ! -e "$replaced_parent_output/.complete" ]] || fail "collector completed after its enclave identity was replaced"
  rm -rf "$REVIEWS_ROOT"
  mv "$saved_reviews_root" "$REVIEWS_ROOT"
fi

failed_database_output="$REVIEWS_ROOT/$TEST_PREFIX-failed-database"
FAKE_PSQL_FAIL=1 node "$COLLECTOR" --output-dir "$failed_database_output" --context fixture-context --allow-local-agent-reviews --database silo=fixture-service --request-timeout 2 >/dev/null
grep -Fq '"collectorRunStatus": "completed-with-failures"' "$failed_database_output/secured/run-summary.json" || fail "database failure did not fail closed"
grep -Fq 'one or more database evidence targets failed' "$failed_database_output/secured/run-summary.json" || fail "database incompleteness missing"
grep -Fq 'fixture psql unavailable' "$failed_database_output/secured/failures.ndjson" || fail "database failure detail missing"

elevated_database_output="$REVIEWS_ROOT/$TEST_PREFIX-elevated-database"
FAKE_PSQL_ELEVATED=1 node "$COLLECTOR" --output-dir "$elevated_database_output" --context fixture-context --allow-local-agent-reviews --database silo=fixture-service --request-timeout 2 >/dev/null
grep -Fq 'dedicated evidence-reader role is required' "$elevated_database_output/secured/failures.ndjson" || fail "elevated database role was not rejected"
[[ ! -e "$elevated_database_output/secured/databases/"*.ndjson ]] || fail "collector persisted evidence from an elevated database role"

session_elevated_database_output="$REVIEWS_ROOT/$TEST_PREFIX-session-elevated-database"
FAKE_PSQL_SESSION_ELEVATED=1 node "$COLLECTOR" --output-dir "$session_elevated_database_output" --context fixture-context --allow-local-agent-reviews --database silo=fixture-service --request-timeout 2 >/dev/null
grep -Fq 'authenticated session role differs from current role' "$session_elevated_database_output/secured/failures.ndjson" || fail "elevated authenticated database role was not rejected"
[[ ! -e "$session_elevated_database_output/secured/databases/"*.ndjson ]] || fail "collector persisted evidence from an elevated authenticated database role"

session_flag_database_output="$REVIEWS_ROOT/$TEST_PREFIX-session-flag-database"
FAKE_PSQL_SESSION_FLAGS=1 node "$COLLECTOR" --output-dir "$session_flag_database_output" --context fixture-context --allow-local-agent-reviews --database silo=fixture-service --request-timeout 2 >/dev/null
grep -Fq 'authenticates with an elevated role' "$session_flag_database_output/secured/failures.ndjson" || fail "elevated authenticated database flags were not rejected"
[[ ! -e "$session_flag_database_output/secured/databases/"*.ndjson ]] || fail "collector persisted evidence from elevated authenticated database flags"

membership_database_output="$REVIEWS_ROOT/$TEST_PREFIX-membership-database"
FAKE_PSQL_MEMBERSHIP=1 node "$COLLECTOR" --output-dir "$membership_database_output" --context fixture-context --allow-local-agent-reviews --database silo=fixture-service --request-timeout 2 >/dev/null
grep -Fq 'standalone evidence-reader role is required' "$membership_database_output/secured/failures.ndjson" || fail "inherited database role membership was not rejected"

privileged_database_output="$REVIEWS_ROOT/$TEST_PREFIX-privileged-database"
FAKE_PSQL_COLUMN_SELECT=1 node "$COLLECTOR" --output-dir "$privileged_database_output" --context fixture-context --allow-local-agent-reviews --database silo=fixture-service --request-timeout 2 >/dev/null
grep -Fq 'base-table read, write, or ownership privileges' "$privileged_database_output/secured/failures.ndjson" || fail "base-table database privileges were not rejected"

writable_database_output="$REVIEWS_ROOT/$TEST_PREFIX-writable-database"
FAKE_PSQL_WRITE=1 node "$COLLECTOR" --output-dir "$writable_database_output" --context fixture-context --allow-local-agent-reviews --database silo=fixture-service --request-timeout 2 >/dev/null
grep -Fq 'base-table read, write, or ownership privileges' "$writable_database_output/secured/failures.ndjson" || fail "base-table write privileges were not rejected"

broad_database_output="$REVIEWS_ROOT/$TEST_PREFIX-broad-database"
FAKE_PSQL_GLOBAL_ACCESS=1 node "$COLLECTOR" --output-dir "$broad_database_output" --context fixture-context --allow-local-agent-reviews --database silo=fixture-service --request-timeout 2 >/dev/null
grep -Fq 'access to a non-system relation or schema creation' "$broad_database_output/secured/failures.ndjson" || fail "out-of-allowlist relation access was not rejected"

printf 'R0 estate evidence collector tests passed.\n'
