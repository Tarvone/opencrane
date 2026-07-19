#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="$ROOT/scripts/phase-d-agent-namespace-boundary.sh"
TMP_DIR="$(mktemp -d)"

cleanup()
{
	rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/libs/backend"
cp -R "$ROOT/libs/backend/agents" "$TMP_DIR/libs/backend/agents"
cp "$ROOT/tsconfig.json" "$ROOT/eslint.config.mjs" "$TMP_DIR/"
mkdir -p "$TMP_DIR/libs/backend/server/personas/main"

set +e
output="$(PHASE_D_AGENT_NAMESPACE_ROOT="$TMP_DIR" "$GUARD" 2>&1)"
status=$?
set -e

if [[ $status -eq 0 ]]; then
	printf '%s\n' "Expected Phase D namespace guard to reject a personal-agent server path" >&2
	exit 1
fi
if ! grep -Fq "personal-agent domain remains under server namespace" <<<"$output"; then
	printf '%s\n%s\n' "Phase D namespace guard failed for the wrong reason:" "$output" >&2
	exit 1
fi

printf '%s\n' "Phase D personal-agent namespace negative test passed."
