#!/usr/bin/env bash
# =============================================================================
# OpenCrane — single machine (VM / VPS) deploy with local image builds
#
# Stands up a one-node Kubernetes cluster on THIS Linux host using k3s, builds
# the OpenCrane images locally, imports them into k3s containerd, and deploys
# them. Ideal for a VM, a VPS, or a single server where you want to run local
# dev builds.
#
# Usage:
#   sudo ./platform/vps-local-deploy.sh [--domain DOMAIN]
#
# Prereqs: a Linux host with docker, curl, and helm.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DOMAIN=""
PASSTHROUGH=()

log()  { echo -e "\033[0;32m[vps-local-deploy]\033[0m $1"; }
err()  { echo -e "\033[0;31m[vps-local-deploy]\033[0m $1" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) PASSTHROUGH+=("$1"); shift ;;
  esac
done

[[ "$(uname -s)" == "Linux" ]] || { err "k3s needs Linux. On a laptop use ./platform/install.sh local (k3d)."; exit 1; }
command -v helm >/dev/null 2>&1 || { err "Missing required command: helm (https://helm.sh/docs/intro/install/)"; exit 1; }
command -v docker >/dev/null 2>&1 || { err "Missing required command: docker (Docker is required to build images locally)"; exit 1; }

# 1. Install k3s (idempotent — skips if already present) → a one-node cluster.
if ! command -v k3s >/dev/null 2>&1; then
  log "Installing k3s…"
  curl -sfL https://get.k3s.io | sh -
fi
export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
if [[ ! -r "$KUBECONFIG" ]]; then
  log "Waiting for $KUBECONFIG to be created and readable..."
  for i in {1..30}; do
    if [[ -r "$KUBECONFIG" ]]; then
      break
    fi
    sleep 2
  done
fi
[[ -r "$KUBECONFIG" ]] || { err "Cannot read $KUBECONFIG (run with sudo, or set KUBECONFIG)."; exit 1; }

# 2. Build local images
log "Building operator image…"
docker build -f "$ROOT_DIR/apps/operator/deploy/Dockerfile" -t ghcr.io/italanta/opencrane-operator:local "$ROOT_DIR"

log "Building tenant image…"
docker build -f "$ROOT_DIR/apps/tenant/deploy/Dockerfile" -t ghcr.io/italanta/opencrane-tenant:local "$ROOT_DIR"

log "Building control-plane image…"
docker build -f "$ROOT_DIR/apps/control-plane/deploy/Dockerfile" -t ghcr.io/italanta/opencrane-control-plane:local "$ROOT_DIR"

# 3. Import images into k3s containerd namespace (k8s.io)
log "Importing images into k3s containerd namespace k8s.io…"
docker save ghcr.io/italanta/opencrane-operator:local | sudo k3s ctr -n k8s.io images import -
docker save ghcr.io/italanta/opencrane-tenant:local | sudo k3s ctr -n k8s.io images import -
docker save ghcr.io/italanta/opencrane-control-plane:local | sudo k3s ctr -n k8s.io images import -

# 4. Deploy using k8s-deploy.sh with local overrides
log "Deploying OpenCrane…"
exec "$SCRIPT_DIR/k8s-deploy.sh" \
  ${DOMAIN:+--domain "$DOMAIN"} \
  --image-tag local \
  --set ingress.className=traefik \
  --set networkPolicy.ingressNamespace=kube-system \
  --set controlPlane.image.pullPolicy=IfNotPresent \
  --set operator.image.pullPolicy=IfNotPresent \
  --set tenant.defaultImage.pullPolicy=IfNotPresent \
  "${PASSTHROUGH[@]}"
