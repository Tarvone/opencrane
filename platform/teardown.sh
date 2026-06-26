#!/usr/bin/env bash
# =============================================================================
# OpenCrane Platform — Teardown & Cleanup Script
#
# Cleans up deployed resources, Helm releases, and namespaces.
#
# Usage:
#   ./platform/teardown.sh [--namespace NS] [--release NAME] [--all] [--yes]
# =============================================================================

set -euo pipefail

NAMESPACE="opencrane-system"
RELEASE="opencrane"
DELETE_ALL=0
ASSUME_YES=0

log()  { echo -e "\033[0;32m[teardown]\033[0m $1"; }
warn() { echo -e "\033[1;33m[teardown]\033[0m $1"; }
err()  { echo -e "\033[0;31m[teardown]\033[0m $1" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --release)   RELEASE="$2"; shift 2 ;;
    --all)       DELETE_ALL=1; shift ;;
    --yes)       ASSUME_YES=1; shift ;;
    -h|--help)   grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           err "Unknown flag: $1"; exit 1 ;;
  esac
done

# Confirm action unless --yes is passed
if [[ "$ASSUME_YES" != "1" ]]; then
  warn "This will delete the OpenCrane Helm release '$RELEASE' and namespace '$NAMESPACE'."
  if [[ "$DELETE_ALL" == "1" ]]; then
    warn "It will ALSO delete cluster-wide controllers: CNPG, cert-manager, ingress-nginx, and external-dns."
  fi
  read -rp "Are you sure you want to proceed? [y/N]: " c
  [[ "$c" =~ ^[Yy]$ ]] || { log "Aborted."; exit 0; }
fi

# 1. Delete OpenCrane Helm release
if helm status "$RELEASE" -n "$NAMESPACE" >/dev/null 2>&1; then
  log "Uninstalling Helm release '$RELEASE' in namespace '$NAMESPACE'…"
  helm uninstall "$RELEASE" -n "$NAMESPACE"
else
  log "Helm release '$RELEASE' not found in namespace '$NAMESPACE'."
fi

# 2. Delete CNPG Postgres clusters to clean up PVs
if kubectl get clusters.postgresql.cnpg.io -n "$NAMESPACE" >/dev/null 2>&1; then
  log "Deleting CloudNativePG cluster resources in '$NAMESPACE'…"
  kubectl delete clusters.postgresql.cnpg.io --all -n "$NAMESPACE" --timeout=1m0s || true
fi

# 3. Delete the main namespace (this cleans up secrets, pods, PVCs, services)
if kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  log "Deleting namespace '$NAMESPACE' (this may take a moment to clean up PVCs/volumes)…"
  kubectl delete namespace "$NAMESPACE" --timeout=3m0s || true
else
  log "Namespace '$NAMESPACE' not found."
fi

# 4. If --all is passed, clean up the shared cluster singletons
if [[ "$DELETE_ALL" == "1" ]]; then
  log "Uninstalling cert-manager controller…"
  helm uninstall cert-manager -n cert-manager >/dev/null 2>&1 || true
  kubectl delete namespace cert-manager >/dev/null 2>&1 || true

  log "Uninstalling ingress-nginx controller…"
  helm uninstall ingress-nginx -n ingress-nginx >/dev/null 2>&1 || true
  kubectl delete namespace ingress-nginx >/dev/null 2>&1 || true

  log "Uninstalling external-dns controller…"
  helm uninstall external-dns -n external-dns >/dev/null 2>&1 || true
  kubectl delete namespace external-dns >/dev/null 2>&1 || true

  log "Uninstalling CloudNativePG operator…"
  helm uninstall cnpg -n "$NAMESPACE" >/dev/null 2>&1 || true
  # CNPG might be in a different namespace if custom. Let's delete its CRDs
  log "Deleting CloudNativePG CustomResourceDefinitions…"
  kubectl delete crd -l app.kubernetes.io/name=cloudnative-pg >/dev/null 2>&1 || true
fi

log "Teardown complete."
