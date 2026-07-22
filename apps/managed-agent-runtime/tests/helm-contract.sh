#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
CHART="${OPENCRANE_MANAGED_RUNTIME_CHART:-$ROOT/apps/managed-agent-runtime/helm}"
MANIFEST="$(mktemp)"
SA="$(mktemp)"
DENY="$(mktemp)"
EGRESS="$(mktemp)"
trap 'rm -f "$MANIFEST" "$SA" "$DENY" "$EGRESS"' EXIT

helm template mar "$CHART" > "$MANIFEST"

awk 'BEGIN { RS="---" } $0 ~ /\nkind: ServiceAccount\n/ { print $0 }' "$MANIFEST" > "$SA"
awk 'BEGIN { RS="---" } $0 ~ /\nkind: NetworkPolicy\n/ && $0 ~ /managed-agent-runtime-default-deny/ { print $0 }' "$MANIFEST" > "$DENY"
awk 'BEGIN { RS="---" } $0 ~ /\nkind: NetworkPolicy\n/ && $0 ~ /managed-agent-runtime-egress/ { print $0 }' "$MANIFEST" > "$EGRESS"

# A distinct connector-scoped ServiceAccount in the managed-runtime identity class, token off.
test -s "$SA"
grep -Fq 'name: managed-agent-runtime-default' "$SA"
grep -Fq 'automountServiceAccountToken: false' "$SA"
if grep -Eq 'name: agent-runtime-[a-z]' "$SA"; then
  echo "managed runtime SA must not use the personal agent-runtime-* class" >&2
  exit 1
fi

# A dedicated restricted namespace, distinct from the server namespace.
grep -Fq 'kind: Namespace' "$MANIFEST"
grep -Fq 'name: opencrane-managed-runtime' "$MANIFEST"
grep -Fq 'pod-security.kubernetes.io/enforce: restricted' "$MANIFEST"

# Default-deny governs all traffic; only the egress policy admits anything.
test -s "$DENY"
grep -Fq 'policyTypes: ["Ingress", "Egress"]' "$DENY"
grep -Fq 'ingress: []' "$DENY"
grep -Fq 'egress: []' "$DENY"
test -s "$EGRESS"
grep -Fq 'policyTypes: ["Egress"]' "$EGRESS"
grep -Fq 'app.kubernetes.io/component: agent-runtime' "$EGRESS"
grep -Fq 'k8s-app: kube-dns' "$EGRESS"
grep -Fq 'app.kubernetes.io/component: channel-proxy' "$EGRESS"
grep -Fq 'app.kubernetes.io/component: artifact-service' "$EGRESS"
grep -Fq 'kubernetes.io/metadata.name: opencrane-artifacts' "$EGRESS"
grep -Fq 'app.kubernetes.io/component: litellm' "$EGRESS"
grep -Fq 'app.kubernetes.io/component: obot' "$EGRESS"
grep -Fq 'const _COMPONENT_LABEL = "agent-runtime";' "$ROOT/libs/backend/agents/runtime/k8s-launcher/src/agent-runtime-job.ts"

# A personal agent-runtime-* SA name must be rejected at render time (identity-class fence).
if helm template mar "$CHART" --set-string managedAgentRuntime.serviceAccountName=agent-runtime-personal >/dev/null 2>&1; then
  echo "personal agent-runtime-* SA name was accepted on the managed chart" >&2
  exit 1
fi
# The namespace must differ from the server namespace.
if helm template mar "$CHART" --set-string managedAgentRuntime.namespace=opencrane >/dev/null 2>&1; then
  echo "server namespace was accepted as the managed-runtime namespace" >&2
  exit 1
fi

echo "managed-agent-runtime namespace, identity, and network contract passed"
