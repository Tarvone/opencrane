#!/usr/bin/env bash
# =============================================================================
# OpenCrane Platform — Interactive Install Wizard
#
# Walks through configuration step-by-step and executes the chosen installer.
#
# Usage:
#   ./platform/wizard.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- Colours -----------------------------------------------------------------

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---- Helpers -----------------------------------------------------------------

function _banner()
{
  echo ""
  echo -e "${CYAN}${BOLD}  ██████╗ ██████╗ ███████╗███╗  ██╗${NC}"
  echo -e "${CYAN}${BOLD} ██╔═══██╗██╔══██╗██╔════╝████╗ ██║${NC}"
  echo -e "${CYAN}${BOLD} ██║   ██║██████╔╝█████╗  ██╔██╗██║${NC}"
  echo -e "${CYAN}${BOLD} ██║   ██║██╔═══╝ ██╔══╝  ██║╚████║${NC}"
  echo -e "${CYAN}${BOLD} ╚██████╔╝██║     ███████╗██║ ╚███║${NC}"
  echo -e "${CYAN}${BOLD}  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚══╝  CRANE${NC}"
  echo ""
  echo -e "${DIM}  Multi-tenant AI agent platform on Kubernetes${NC}"
  echo ""
}

function _step()
{
  echo ""
  echo -e "${BLUE}${BOLD}──────────────────────────────────────────────────${NC}"
  echo -e " ${BOLD}$1${NC}"
  echo -e "${BLUE}${BOLD}──────────────────────────────────────────────────${NC}"
  echo ""
}

function _prompt()
{
  local label="$1"
  local default="${2:-}"
  local var_name="$3"

  if [[ -n "$default" ]]; then
    printf "  ${BOLD}%s${NC} ${DIM}[%s]${NC}: " "$label" "$default"
  else
    printf "  ${BOLD}%s${NC}: " "$label"
  fi

  read -r input
  if [[ -z "$input" && -n "$default" ]]; then
    input="$default"
  fi

  # Assign to the caller's variable name via printf to a temp var
  printf -v "$var_name" '%s' "$input"
}

function _check()
{
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} $cmd"
  else
    echo -e "  ${RED}✗${NC} $cmd ${RED}(not found — install before continuing)${NC}"
    return 1
  fi
}

function _summary_row()
{
  printf "  ${DIM}%-22s${NC} ${BOLD}%s${NC}\n" "$1" "$2"
}

# ---- Welcome -----------------------------------------------------------------

_banner

echo -e "${DIM}  This wizard will walk you through installing OpenCrane.${NC}"
echo -e "${DIM}  Press Enter to accept defaults shown in [brackets].${NC}"

# ---- Step 1: Choose target ---------------------------------------------------

_step "Step 1 of 7 — Install target"

echo -e "  Where do you want to install OpenCrane?\n"
echo -e "  ${BOLD}1)${NC} Local          — k3d cluster on this machine (development / full stack)"
echo -e "  ${BOLD}2)${NC} VPS            — single machine using k3s (VM, VPS, bare metal)"
echo -e "  ${BOLD}3)${NC} GCP            — Google Cloud GKE (production / staging)"
echo -e "  ${BOLD}4)${NC} Custom Cluster — existing Kubernetes cluster (custom context)"
echo ""
printf "  ${BOLD}Choose [1/2/3/4]${NC}: "
read -r mode_choice
mode_choice="${mode_choice:-1}"

case "$mode_choice" in
  1) mode="local" ;;
  2) mode="vps" ;;
  3) mode="gcp" ;;
  4) mode="custom" ;;
  *)
    echo -e "${RED}  Invalid choice: $mode_choice${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "  ${GREEN}✓${NC} Target: ${BOLD}$mode${NC}"

# ---- Step 2: Gather config ---------------------------------------------------

NAMESPACE="opencrane-system"
RELEASE="opencrane"
CLUSTER_NAME="opencrane-local"
LOCAL_PROFILE="default"
KEEP_CLUSTER="1"
keep_label="yes"
PROJECT_ID=""
REGION="europe-west1"
DOMAIN=""
ENVIRONMENT="dev"
INGRESS_IP=""
DNS_MANAGED_ZONE=""

if [[ "$mode" == "local" ]]; then

  _step "Step 2 of 7 — Local cluster settings"

  _prompt "Cluster name"    "opencrane-local"   CLUSTER_NAME
  _prompt "Namespace"       "opencrane-system"  NAMESPACE
  _prompt "Local profile (default/strict)" "default" LOCAL_PROFILE

  echo ""
  printf "  ${BOLD}Keep cluster after install?${NC} ${DIM}[Y/n]${NC}: "
  read -r keep_input
  keep_input="${keep_input:-Y}"
  if [[ "$keep_input" =~ ^[Yy]$ ]]; then
    KEEP_CLUSTER="1"
    keep_label="yes"
  else
    KEEP_CLUSTER="0"
    keep_label="no"
  fi

elif [[ "$mode" == "vps" || "$mode" == "custom" ]]; then

  _step "Step 2 of 7 — Cluster settings"

  _prompt "Base domain (required)"       ""               DOMAIN
  _prompt "Namespace"                    "opencrane-system" NAMESPACE
  _prompt "Release name"                 "opencrane"      RELEASE
  _prompt "Ingress external IP (optional)" ""             INGRESS_IP
  _prompt "DNS managed zone (optional)"  ""               DNS_MANAGED_ZONE

  if [[ -z "$DOMAIN" ]]; then
    echo -e "\n  ${RED}✗  Base domain is required.${NC}"
    exit 1
  fi

else

  _step "Step 2 of 7 — GCP configuration"

  _prompt "GCP Project ID (required)"    ""               PROJECT_ID
  _prompt "Region"                      "europe-west1"   REGION
  _prompt "Base domain (required)"       ""               DOMAIN
  _prompt "Environment"                 "dev"            ENVIRONMENT
  _prompt "Namespace"                    "opencrane-system" NAMESPACE
  _prompt "Release name"                 "opencrane"      RELEASE

  if [[ -z "$PROJECT_ID" ]]; then
    echo -e "\n  ${RED}✗  GCP Project ID is required.${NC}"
    exit 1
  fi
  if [[ -z "$DOMAIN" ]]; then
    echo -e "\n  ${RED}✗  Base domain is required.${NC}"
    exit 1
  fi

fi

# ---- Step 3: Choose profile --------------------------------------------------
#
# Choose between Single-tenant (one organization pre-seeded with billing off)
# or Multi-tenant (self-service signup and billing enabled). Currently restricted
# to single-tenant, but the structure is maintained to allow selection.

PROFILE="single-tenant"
ORG_NAME=""
ORG_OWNER_EMAIL=""
ORG_DISPLAY_NAME=""
ORG_TIER="shared"

if [[ "$mode" != "local" ]]; then
  _step "Step 3 of 7 — Choose deployment profile"

  echo -e "  Choose the deployment profile for this cluster:\n"
  echo -e "  ${BOLD}1)${NC} Single-tenant — one pre-seeded organization, self-service is OFF"
  echo -e "  ${BOLD}2)${NC} Multi-tenant  — self-service organization signup + billing are ON"
  echo ""
  printf "  ${BOLD}Choose [1/2, default 1]${NC}: "
  read -r profile_choice
  profile_choice="${profile_choice:-1}"

  case "$profile_choice" in
    1)
      PROFILE="single-tenant"
      ;;
    2)
      echo ""
      echo -e "  ${YELLOW}⚠  Multi-tenant setup is currently restricted.${NC}"
      echo -e "     Defaulting to single-tenant profile for this installation."
      PROFILE="single-tenant"
      ;;
    *)
      echo -e "${RED}  Invalid choice: $profile_choice${NC}"
      exit 1
      ;;
  esac

  echo ""
  echo -e "  Configure the pre-seeded organization details:"
  echo ""
  _prompt "Organization name (e.g. acme)" "" ORG_NAME
  _prompt "Organization owner email"       "" ORG_OWNER_EMAIL
  _prompt "Organization display name (optional)" "" ORG_DISPLAY_NAME
  _prompt "Organization tier (shared/dedicatedNodes/dedicatedCluster)" "shared" ORG_TIER

  if [[ -z "$ORG_NAME" ]]; then
    echo -e "\n  ${RED}✗  Organization name is required for single-tenant setup.${NC}"
    exit 1
  fi
  if [[ -z "$ORG_OWNER_EMAIL" ]]; then
    echo -e "\n  ${RED}✗  Organization owner email is required for single-tenant setup.${NC}"
    exit 1
  fi
fi

# ---- Step 4: Platform-operator seed (optional) -------------------------------
#
# Optional, per-cluster bootstrap of the FIRST platform operator. The caller whose
# VERIFIED OIDC email equals this becomes a platform operator (OR-ed with any IdP
# group mapping). Press Enter to SKIP — an empty seed grants operator to nobody
# (fail-closed). This is never persisted in the repo; it is passed to the installer
# at deploy time only.

_step "Step 4 of 7 — Platform-operator seed (optional)"

echo -e "  ${DIM}Bootstrap the first platform operator by email — useful before you"
echo -e "  have an IdP group mapping. The caller whose VERIFIED OIDC email matches"
echo -e "  becomes a platform operator. Leave blank to skip (nobody is seeded).${NC}"
echo ""
_prompt "Platform-operator seed email (Enter to skip)" "" PLATFORM_OPERATOR_SEED_EMAIL

if [[ -n "$PLATFORM_OPERATOR_SEED_EMAIL" ]]; then
  seed_label="$PLATFORM_OPERATOR_SEED_EMAIL"
  echo ""
  echo -e "  ${GREEN}✓${NC} Will seed platform operator: ${BOLD}$PLATFORM_OPERATOR_SEED_EMAIL${NC}"
else
  seed_label="(none — fail-closed)"
  echo ""
  echo -e "  ${DIM}No seed — platform-operator access is granted only via IdP groups.${NC}"
fi

# ---- Step 5: TLS / certificates ----------------------------------------------
#
# Three modes mirror k8s-deploy.sh Step 2.5: off (TLS handled elsewhere), selfSigned
# (dev/local — not browser-trusted), and acme/DNS-01 (production wildcard via Let's Encrypt + Cloud DNS).
# acme additionally collects the ACME contact email and (for an external zone) a
# service-account key file. The choices flow to the installer as env vars (same pattern
# as the operator seed); k8s-deploy.sh re-validates and runs the DNS-01 preflight.

_step "Step 5 of 7 — TLS / certificates"

echo -e "  How should OpenCrane obtain TLS certificates?\n"
echo -e "  ${BOLD}1)${NC} Off        — TLS terminated elsewhere (load balancer / external ingress)"
echo -e "  ${BOLD}2)${NC} Self-signed — dev / k3d / bare IP (instant, NOT browser-trusted)"
echo -e "  ${BOLD}3)${NC} ACME (DNS-01) — production wildcard via Let's Encrypt + Google Cloud DNS"
echo ""
printf "  ${BOLD}Choose [1/2/3]${NC}: "
read -r cert_choice
cert_choice="${cert_choice:-1}"

CERT_MODE_ENV="off"
ACME_EMAIL=""
DNS01_PROVIDER=""
DNS01_CREDENTIALS=""

case "$cert_choice" in
  1)
    cert_label="off"
    ;;
  2)
    CERT_MODE_ENV="selfSigned"
    cert_label="self-signed"
    ;;
  3)
    CERT_MODE_ENV="acme"
    DNS01_PROVIDER="clouddns"
    _prompt "ACME contact email" "" ACME_EMAIL
    if [[ -z "$ACME_EMAIL" ]]; then
      echo -e "\n  ${RED}✗  ACME mode requires a contact email.${NC}"
      exit 1
    fi
    echo ""
    echo -e "  ${DIM}On GKE Workload Identity the cert-manager service account needs"
    echo -e "  roles/dns.admin on the DNS zone's project. For an EXTERNAL zone, supply a"
    echo -e "  service-account key file below (Enter to skip = Workload Identity).${NC}"
    echo ""
    _prompt "Cloud DNS SA key file (Enter for Workload Identity)" "" DNS01_CREDENTIALS
    cert_label="acme / DNS-01 (clouddns)"
    ;;
  *)
    echo -e "${RED}  Invalid choice: $cert_choice${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "  ${GREEN}✓${NC} TLS: ${BOLD}$cert_label${NC}"

# ---- Step 6: Pre-flight check ------------------------------------------------

_step "Step 6 of 7 — Pre-flight checks"

has_error=0

if [[ "$mode" == "local" ]]; then
  _check docker  || has_error=1
  _check kubectl || has_error=1
  _check helm    || has_error=1
  _check k3d     || has_error=1
elif [[ "$mode" == "gcp" ]]; then
  _check gcloud    || has_error=1
  _check terraform || has_error=1
  _check docker    || has_error=1
  _check pnpm      || has_error=1
else
  _check kubectl || has_error=1
  _check helm    || has_error=1
  _check curl    || has_error=1
fi

if [[ "$has_error" == "1" ]]; then
  echo ""
  echo -e "  ${RED}One or more required tools are missing. Install them and re-run the wizard.${NC}"
  exit 1
fi

echo ""
echo -e "  ${GREEN}✓${NC} All required tools found."

# ---- Step 7: Summary + confirm -----------------------------------------------

_step "Step 7 of 7 — Summary"

echo ""
if [[ "$mode" == "local" ]]; then
  _summary_row "Mode"           "local (k3d)"
  _summary_row "Cluster name"   "$CLUSTER_NAME"
  _summary_row "Namespace"      "$NAMESPACE"
  _summary_row "Profile"        "$LOCAL_PROFILE"
  _summary_row "Keep cluster"   "$keep_label"
  _summary_row "Operator seed"  "$seed_label"
  _summary_row "TLS"            "$cert_label"
  _summary_row "Script"         "platform/tests/k3d-local.sh"
elif [[ "$mode" == "vps" ]]; then
  _summary_row "Mode"           "VPS (k3s)"
  _summary_row "Base domain"    "$DOMAIN"
  _summary_row "Profile"        "$PROFILE"
  _summary_row "Org Name"       "$ORG_NAME"
  _summary_row "Org Owner"      "$ORG_OWNER_EMAIL"
  _summary_row "Org Tier"       "$ORG_TIER"
  _summary_row "Namespace"      "$NAMESPACE"
  _summary_row "Release name"   "$RELEASE"
  _summary_row "Operator seed"  "$seed_label"
  _summary_row "TLS"            "$cert_label"
  _summary_row "Script"         "platform/vps-deploy.sh"
elif [[ "$mode" == "gcp" ]]; then
  _summary_row "Mode"           "GCP (GKE)"
  _summary_row "Project ID"     "$PROJECT_ID"
  _summary_row "Region"         "$REGION"
  _summary_row "Base domain"    "$DOMAIN"
  _summary_row "Profile"        "$PROFILE"
  _summary_row "Org Name"       "$ORG_NAME"
  _summary_row "Org Owner"      "$ORG_OWNER_EMAIL"
  _summary_row "Org Tier"       "$ORG_TIER"
  _summary_row "Environment"    "$ENVIRONMENT"
  _summary_row "Namespace"      "$NAMESPACE"
  _summary_row "Release name"   "$RELEASE"
  _summary_row "Operator seed"  "$seed_label"
  _summary_row "TLS"            "$cert_label"
  _summary_row "Script"         "platform/gke-deploy.sh"
else
  _summary_row "Mode"           "Custom Cluster"
  _summary_row "Base domain"    "$DOMAIN"
  _summary_row "Profile"        "$PROFILE"
  _summary_row "Org Name"       "$ORG_NAME"
  _summary_row "Org Owner"      "$ORG_OWNER_EMAIL"
  _summary_row "Org Tier"       "$ORG_TIER"
  _summary_row "Namespace"      "$NAMESPACE"
  _summary_row "Release name"   "$RELEASE"
  _summary_row "Operator seed"  "$seed_label"
  _summary_row "TLS"            "$cert_label"
  _summary_row "Script"         "platform/k8s-deploy.sh"
fi
echo ""

printf "  ${BOLD}Everything looks good. Proceed?${NC} ${DIM}[Y/n]${NC}: "
read -r confirm
confirm="${confirm:-Y}"
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo ""
  echo -e "  ${YELLOW}Aborted.${NC}"
  exit 0
fi

# ---- Execute -----------------------------------------------------------------
#
# The per-cluster operator seed and the cert-manager choice both flow through as env
# vars or CLI flags the installers honour: k3d-local.sh / k8s-deploy.sh read
# OPENCRANE_PLATFORM_OPERATOR_SEED_EMAIL and the OPENCRANE_CERT_* set below, passing each
# to Helm/Step-2.5 only when non-empty. Empty seed → operator granted to nobody; cert
# mode "off" → no cert-manager. k8s-deploy.sh re-validates and runs the DNS-01 preflight.

echo ""
echo -e "${GREEN}${BOLD}  ✦ Starting install...${NC}"
echo ""

if [[ "$mode" == "local" ]]; then
  KEEP_CLUSTER="$KEEP_CLUSTER" \
  CLUSTER_NAME="$CLUSTER_NAME" \
  NAMESPACE="$NAMESPACE" \
  LOCAL_PROFILE="$LOCAL_PROFILE" \
  OPENCRANE_PLATFORM_OPERATOR_SEED_EMAIL="$PLATFORM_OPERATOR_SEED_EMAIL" \
  OPENCRANE_CERT_MODE="$CERT_MODE_ENV" \
  OPENCRANE_ACME_EMAIL="$ACME_EMAIL" \
  OPENCRANE_DNS01_PROVIDER="$DNS01_PROVIDER" \
  OPENCRANE_DNS01_CREDENTIALS="$DNS01_CREDENTIALS" \
    "$SCRIPT_DIR/tests/k3d-local.sh"
elif [[ "$mode" == "vps" ]]; then
  "$SCRIPT_DIR/vps-deploy.sh" \
    --base-domain "$DOMAIN" \
    --profile "$PROFILE" \
    --org-name "$ORG_NAME" \
    --org-owner-email "$ORG_OWNER_EMAIL" \
    ${ORG_DISPLAY_NAME:+--org-display-name "$ORG_DISPLAY_NAME"} \
    --org-tier "$ORG_TIER" \
    --namespace "$NAMESPACE" \
    --release "$RELEASE" \
    --platform-operator-seed-email "$PLATFORM_OPERATOR_SEED_EMAIL" \
    ${CERT_MODE_ENV:+--cert-manager} \
    ${ACME_EMAIL:+--acme-email "$ACME_EMAIL"} \
    ${DNS01_PROVIDER:+--dns01-provider "$DNS01_PROVIDER"} \
    ${DNS01_CREDENTIALS:+--dns01-credentials "$DNS01_CREDENTIALS"}
elif [[ "$mode" == "gcp" ]]; then
  "$SCRIPT_DIR/gke-deploy.sh" \
    --project-id "$PROJECT_ID" \
    --region "$REGION" \
    --base-domain "$DOMAIN" \
    --yes \
    --profile "$PROFILE" \
    --org-name "$ORG_NAME" \
    --org-owner-email "$ORG_OWNER_EMAIL" \
    ${ORG_DISPLAY_NAME:+--org-display-name "$ORG_DISPLAY_NAME"} \
    --org-tier "$ORG_TIER" \
    --namespace "$NAMESPACE" \
    --release "$RELEASE" \
    --platform-operator-seed-email "$PLATFORM_OPERATOR_SEED_EMAIL" \
    ${CERT_MODE_ENV:+--cert-manager} \
    ${ACME_EMAIL:+--acme-email "$ACME_EMAIL"} \
    ${DNS01_PROVIDER:+--dns01-provider "$DNS01_PROVIDER"} \
    ${DNS01_CREDENTIALS:+--dns01-credentials "$DNS01_CREDENTIALS"}
else
  "$SCRIPT_DIR/k8s-deploy.sh" \
    --base-domain "$DOMAIN" \
    --profile "$PROFILE" \
    --org-name "$ORG_NAME" \
    --org-owner-email "$ORG_OWNER_EMAIL" \
    ${ORG_DISPLAY_NAME:+--org-display-name "$ORG_DISPLAY_NAME"} \
    --org-tier "$ORG_TIER" \
    --namespace "$NAMESPACE" \
    --release "$RELEASE" \
    --platform-operator-seed-email "$PLATFORM_OPERATOR_SEED_EMAIL" \
    ${CERT_MODE_ENV:+--cert-manager} \
    ${ACME_EMAIL:+--acme-email "$ACME_EMAIL"} \
    ${DNS01_PROVIDER:+--dns01-provider "$DNS01_PROVIDER"} \
    ${DNS01_CREDENTIALS:+--dns01-credentials "$DNS01_CREDENTIALS"}
fi

echo ""
echo -e "${GREEN}${BOLD}  ✦ Done!${NC}"
echo ""
