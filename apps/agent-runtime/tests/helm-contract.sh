#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
rendered="$(helm template quality "$repo_root/apps/_infra/deploy-k8s" --namespace silo-a --set agentRuntime.enabled=true)"
runtime_deployment="$(printf '%s\n' "$rendered" | awk 'BEGIN { RS="---" } /kind: Deployment/ && /app.kubernetes.io\/component: agent-runtime/ { print }')"

if [[ -z "$runtime_deployment" ]]; then
	echo "agent-runtime Helm contract: runtime Deployment was not rendered" >&2
	exit 1
fi

grep -q 'runAsUser: 65532' <<< "$runtime_deployment"
grep -q 'runAsGroup: 65532' <<< "$runtime_deployment"
grep -q 'fsGroup: 65532' <<< "$runtime_deployment"
grep -q 'fsGroupChangePolicy: OnRootMismatch' <<< "$runtime_deployment"
grep -q 'defaultMode: 0440' <<< "$runtime_deployment"
grep -q 'audience: opencrane-agent-runtime' <<< "$runtime_deployment"

echo "agent-runtime Helm contract: non-root token readability is pinned"
