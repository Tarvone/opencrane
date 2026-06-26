#!/usr/bin/env bash
# =============================================================================
# OpenCrane — single machine (VM / VPS) deploy
#
# Stands up a one-node Kubernetes cluster on THIS Linux host using k3s, then
# installs OpenCrane onto it. Ideal for a VM, a VPS, or a single server.
#
# Usage:
#   sudo ./platform/vps-deploy.sh [--base-domain BASE_DOMAIN]
#
# Prereqs: a Linux host with curl + helm (this script installs k3s for you).
# For laptop/dev on macOS or Windows, use ./platform/install.sh local (k3d).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN=""
PASSTHROUGH=()

log()  { echo -e "\033[0;32m[vps-deploy]\033[0m $1"; }
err()  { echo -e "\033[0;31m[vps-deploy]\033[0m $1" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-domain) DOMAIN="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) PASSTHROUGH+=("$1"); shift ;;
  esac
done

[[ "$(uname -s)" == "Linux" ]] || { err "k3s needs Linux. On a laptop use ./platform/install.sh local (k3d)."; exit 1; }
command -v helm >/dev/null 2>&1 || { err "Missing required command: helm (https://helm.sh/docs/intro/install/)"; exit 1; }

export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"

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

# 2. Make kubeconfig accessible to the invoking non-root user (if run via sudo)
if [[ -n "${SUDO_USER:-}" && -f "$KUBECONFIG" ]]; then
  USER_HOME=$(eval echo "~$SUDO_USER")
  if [[ -d "$USER_HOME" ]]; then
    log "Configuring kubeconfig for user $SUDO_USER in $USER_HOME/.kube/config..."
    mkdir -p "$USER_HOME/.kube"
    if [[ -f "$USER_HOME/.kube/config" && ! -L "$USER_HOME/.kube/config" ]]; then
      mv "$USER_HOME/.kube/config" "$USER_HOME/.kube/config.bak.$(date +%s)"
    fi
    cp "$KUBECONFIG" "$USER_HOME/.kube/config"
    chown -R "$SUDO_USER" "$USER_HOME/.kube"
    chmod 600 "$USER_HOME/.kube/config"
  fi
fi

log "Cluster ready. Installing OpenCrane…"
# k3s ships the 'local-path' default StorageClass and a Traefik ingress out of the box.
exec "$SCRIPT_DIR/k8s-deploy.sh" ${DOMAIN:+--base-domain "$DOMAIN"} --set ingress.className=traefik --set networkPolicy.ingressNamespace=kube-system "${PASSTHROUGH[@]}"
