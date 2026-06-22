import type { Logger } from "pino";

/**
 * Per-org domain provisioning seam (fixed-wildcard topology), operator side.
 *
 * Mirrors the control-plane `OrgDomainProvisioner` interface
 * (`core/cluster-tenants/org-domain-provisioner.types.ts`). When an org becomes
 * `ready` it is addressable at `<name>.<base>` and its users at
 * `<user>.<name>.<base>`. Two cluster-side side effects must follow: a per-org
 * wildcard DNS record `*.<name>.<base>` → ingress IP, and a per-org wildcard TLS
 * Certificate (cert-manager DNS-01), because the platform `*.<base>` cert does not
 * cover the extra label.
 *
 * cert-manager is NOT installed on the dev cluster, so the default implementation
 * is GATED: when the backend is unavailable it returns `{ ready: false }` with a
 * `skipped` flag and the reconciler records a `DomainProvisioningSkipped` status
 * condition — it never throws, never crashes the reconcile, and the org still
 * reaches `ready` (the namespace boundary is what gates openclaw attachment, not
 * the cert). A real DNS-01 implementation is a separate workstream.
 */

/** Inputs the reconciler passes when provisioning an org's domain + TLS. */
export interface OrgDomainProvisionRequest
{
  /** Org (ClusterTenant) name — the single DNS label, e.g. `acme`. */
  orgName: string;
  /** Platform wildcard base the org hangs off, e.g. `weownai.eu`. */
  platformBaseDomain: string;
  /** Optional customer-vanity domain CNAMEd onto the org apex; added to cert SANs. */
  vanityDomain?: string;
  /** Cluster ingress external IP the per-org wildcard A record must point at. */
  ingressIp?: string;
}

/** Result reported back to the reconciler so it can stamp the org's status. */
export interface OrgDomainProvisionResult
{
  /** Canonical org apex the record + cert were provisioned for (`<name>.<base>`). */
  orgDomain: string;
  /** The per-org wildcard DNS name (`*.<name>.<base>`). */
  wildcardDnsName: string;
  /** Name of the cert-manager-managed TLS Secret holding the issued wildcard cert. */
  tlsSecretName?: string;
  /** Whether issuance completed. False while DNS-01 is in flight OR when skipped. */
  ready: boolean;
  /**
   * True when the backend (cert-manager / DNS) was unavailable and the step was
   * skipped gracefully. The reconciler surfaces this as a status condition; the org
   * still reaches `ready` because the namespace boundary is the attachment gate.
   */
  skipped: boolean;
  /** Human-readable detail, set when skipped or in flight. */
  message?: string;
}

/** Backend that materialises an org's DNS record + wildcard TLS certificate. */
export interface OrgDomainProvisioner
{
  /**
   * Provision (idempotently) the per-org wildcard DNS record and TLS certificate.
   * MUST NOT throw on backend-unavailable — return `{ ready: false, skipped: true }`.
   *
   * @param req - Org coordinates, platform base, optional vanity domain, ingress IP.
   * @returns The provisioned apex, wildcard name, readiness, and skip flag.
   */
  provisionOrgDomain(req: OrgDomainProvisionRequest): Promise<OrgDomainProvisionResult>;
}

/**
 * Default org-domain provisioner.
 *
 * cert-manager DNS-01 issuance is not yet wired (and cert-manager is absent on the
 * dev cluster), so this implementation always SKIPS gracefully: it computes the
 * canonical names the org WOULD use and returns `{ ready: false, skipped: true }`
 * so the reconcile records the intent without ever touching DNS or cert-manager.
 * Swapping in a live DNS-01 backend is a drop-in replacement behind this interface.
 */
export class GatedOrgDomainProvisioner implements OrgDomainProvisioner
{
  /** Whether a live cert-manager / DNS backend is wired. Off by default (dev cluster). */
  private readonly backendAvailable: boolean;

  /** Scoped logger. */
  private readonly log: Logger;

  /**
   * @param log - Root logger; scoped to `org-domain-provisioner`.
   * @param backendAvailable - Whether a live cert-manager/DNS backend is present.
   *   Defaults to false — the dev cluster has no cert-manager, so the step skips.
   */
  constructor(log: Logger, backendAvailable = false)
  {
    this.log = log.child({ component: "org-domain-provisioner" });
    this.backendAvailable = backendAvailable;
  }

  /** Provision the per-org domain, or skip gracefully when no backend is wired. */
  async provisionOrgDomain(req: OrgDomainProvisionRequest): Promise<OrgDomainProvisionResult>
  {
    const orgDomain = `${req.orgName}.${req.platformBaseDomain}`;
    const wildcardDnsName = `*.${orgDomain}`;

    if (!this.backendAvailable)
    {
      this.log.info(
        { orgName: req.orgName, orgDomain, wildcardDnsName },
        "org domain provisioning skipped: no cert-manager/DNS backend wired (degrading gracefully)",
      );
      return {
        orgDomain,
        wildcardDnsName,
        ready: false,
        skipped: true,
        message: "cert-manager/DNS backend unavailable; per-org wildcard cert + DNS record not provisioned",
      };
    }

    // A live DNS-01 backend would create the per-org A record and Certificate here.
    // Intentionally unimplemented until cert-manager is installed; the interface lets
    // that land without touching the reconciler.
    return {
      orgDomain,
      wildcardDnsName,
      tlsSecretName: `opencrane-${req.orgName}-wildcard-tls`,
      ready: false,
      skipped: false,
      message: "DNS-01 issuance not yet implemented",
    };
  }
}
