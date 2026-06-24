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

if [[ -z "$DOMAIN" ]]; then
  read -rp "Enter the domain for this deployment [devbcknd.opencrane.ai]: " DOMAIN
  DOMAIN="${DOMAIN:-devbcknd.opencrane.ai}"
fi

# 0. Prompt for OIDC configuration (Optional)
CONFIGURE_OIDC="false"
echo "=== OIDC Configuration (Optional) ==="
read -rp "Do you want to configure OIDC? (y/N): " configure_oidc
if [[ "$configure_oidc" =~ ^[Yy]$ ]]; then
  read -rp "Enter OIDC Issuer URL (e.g. https://accounts.google.com): " OIDC_ISSUER_URL
  read -rp "Enter OIDC Client ID: " OIDC_CLIENT_ID
  read -rp "Enter OIDC Client Secret: " OIDC_CLIENT_SECRET
  read -rp "Enter OIDC Redirect URI: " OIDC_REDIRECT_URI

  if [[ -n "$OIDC_ISSUER_URL" && -n "$OIDC_CLIENT_ID" && -n "$OIDC_CLIENT_SECRET" && -n "$OIDC_REDIRECT_URI" ]]; then
    CONFIGURE_OIDC="true"
  else
    log "Some OIDC variables were left empty. Skipping OIDC configuration."
  fi
fi

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

# Ensure namespace exists
sudo k3s kubectl create namespace opencrane-system --dry-run=client -o yaml | sudo k3s kubectl apply -f -

# Check if a real Let's Encrypt certificate exists on the host for this domain
if [[ -r "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" && -r "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]]; then
  log "Found existing Let's Encrypt certificate for $DOMAIN. Importing it..."
  sudo k3s kubectl create secret tls opencrane-wildcard-tls \
    --cert="/etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
    --key="/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
    -n opencrane-system \
    --dry-run=client -o yaml | sudo k3s kubectl apply -f -
else
  log "Generating wildcard self-signed TLS certificate for *.$DOMAIN..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /tmp/tls.key -out /tmp/tls.crt \
    -subj "/CN=*.$DOMAIN/O=OpenCrane" \
    -addext "subjectAltName = DNS:*.$DOMAIN, DNS:$DOMAIN" 2>/dev/null || \
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /tmp/tls.key -out /tmp/tls.crt \
    -subj "/CN=*.$DOMAIN/O=OpenCrane" 2>/dev/null

  log "Creating wildcard TLS secret 'opencrane-wildcard-tls'..."
  sudo k3s kubectl create secret tls opencrane-wildcard-tls \
    --cert=/tmp/tls.crt \
    --key=/tmp/tls.key \
    -n opencrane-system \
    --dry-run=client -o yaml | sudo k3s kubectl apply -f -
  rm -f /tmp/tls.key /tmp/tls.crt
fi

log "Updating values.yaml with ingress and TLS settings..."
DOMAIN_ESC=$(echo "$DOMAIN" | sed 's/[&/\]/\\&/g')
sed -i '/^ingress:/,/secretName:/ {
  s|className:.*|className: traefik|
  s|domain:.*|domain: '"$DOMAIN_ESC"'|
  s|enabled: false|enabled: true|
}' "$ROOT_DIR/platform/helm/values.yaml"

if [[ "$CONFIGURE_OIDC" == "true" ]]; then
  log "Creating control-plane-oidc-secrets Secret..."
  # Create secret
  sudo k3s kubectl create secret generic control-plane-oidc-secrets \
    --from-literal=OIDC_SESSION_SECRET="$(openssl rand -hex 32)" \
    --from-literal=OIDC_CLIENT_SECRET="$OIDC_CLIENT_SECRET" \
    -n opencrane-system \
    --dry-run=client -o yaml | sudo k3s kubectl apply -f -

  log "Updating values.yaml with OIDC settings..."
  OIDC_ISSUER_URL_ESC=$(echo "$OIDC_ISSUER_URL" | sed 's/[&/\]/\\&/g')
  OIDC_CLIENT_ID_ESC=$(echo "$OIDC_CLIENT_ID" | sed 's/[&/\]/\\&/g')
  OIDC_REDIRECT_URI_ESC=$(echo "$OIDC_REDIRECT_URI" | sed 's/[&/\]/\\&/g')

  sed -i '/oidc:/,/existingSecret:/ {
    s|enabled:.*|enabled: true|
    s|issuerUrl:.*|issuerUrl: "'"$OIDC_ISSUER_URL_ESC"'"|
    s|clientId:.*|clientId: "'"$OIDC_CLIENT_ID_ESC"'"|
    s|redirectUri:.*|redirectUri: "'"$OIDC_REDIRECT_URI_ESC"'"|
    s|existingSecret:.*|existingSecret: "control-plane-oidc-secrets"|
  }' "$ROOT_DIR/platform/helm/values.yaml"
fi

# 2. Build local images
log "Building operator image…"
docker build -f "$ROOT_DIR/apps/operator/deploy/Dockerfile" -t ghcr.io/italanta/opencrane-operator:local "$ROOT_DIR"

log "Building tenant image…"
docker build -f "$ROOT_DIR/apps/tenant/deploy/Dockerfile" -t ghcr.io/italanta/opencrane-tenant:local "$ROOT_DIR"

log "Building control-plane image…"
docker build -f "$ROOT_DIR/apps/control-plane/deploy/Dockerfile" -t ghcr.io/italanta/opencrane-control-plane:local "$ROOT_DIR"

log "Building skill-registry image…"
docker build -f "$ROOT_DIR/apps/skill-registry/deploy/Dockerfile" -t ghcr.io/italanta/opencrane-skill-registry:local "$ROOT_DIR"

# 3. Import images into k3s containerd namespace (k8s.io)
log "Importing images into k3s containerd namespace k8s.io…"
docker save ghcr.io/italanta/opencrane-operator:local | sudo k3s ctr -n k8s.io images import -
docker save ghcr.io/italanta/opencrane-tenant:local | sudo k3s ctr -n k8s.io images import -
docker save ghcr.io/italanta/opencrane-control-plane:local | sudo k3s ctr -n k8s.io images import -
docker save ghcr.io/italanta/opencrane-skill-registry:local | sudo k3s ctr -n k8s.io images import -

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
  --set skillRegistry.image.pullPolicy=IfNotPresent \
  "${PASSTHROUGH[@]}"
