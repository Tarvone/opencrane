import { _EnsureMemberTenant } from "@opencrane/backend/server/tenancy/cluster-tenants";
import { _ResolvePerOrgClient } from "@opencrane/server/_infra/auth";

import type { AdoptMemberOnLoginOptions } from "./identity-workflows.types.js";

/**
 * Adopt a verified user into their organisation on first login and seed their workspace —
 * the "missing middle" of the onboarding funnel (#126 S4). Invoked from the OIDC post-login
 * hook ({@link OidcAuthService.onLoginEstablished}) once a fresh session is established.
 *
 * Membership is *proven*, not asserted: the login only reaches here having authenticated
 * against the host's per-org Zitadel client, whose `urn:zitadel:iam:org:id:{orgId}` scope
 * restricts it to that org's user pool. So a successful per-org login is itself evidence the
 * user belongs to the org — no separate invite-token check is needed. We therefore run only
 * when {@link _ResolvePerOrgClient} resolves (a fully-provisioned org host); a masters/platform
 * login resolves to null and is skipped (nothing to adopt into).
 *
 * On a per-org login we:
 *  1. materialize the trusted ClusterTenant owner as `Owner`, otherwise adopt `Member` —
 *     create-if-absent, never downgrading an existing Owner/Admin.
 *  2. seed the member's subject-bound workspace via {@link _EnsureMemberTenant} (idempotent,
 *     gated on ≥1 registered model, and a no-op for the owner who already holds `<org>-default`).
 *
 * Best-effort by contract: the caller catches and logs any throw so adoption can never break a
 * login; the next login retries a failed local upsert or workspace seed.
 *
 * @param opts.prisma      - Silo Prisma client (local membership read-model + workspace projection).
 * @param opts.customApi   - Cluster custom-objects client for per-org CR resolution (null in dev/test → skip).
 * @param opts.namespace   - The silo namespace the seeded Tenant CRD is written into.
 * @param opts.host        - The request host the login arrived on (resolves the org + its client).
 * @param opts.subject     - The member's IdP-verified subject (OIDC `sub`).
 * @param opts.email       - The member's IdP-verified email.
 * @param opts.log         - Scoped logger.
 */
export async function _AdoptMemberOnLogin(opts: AdoptMemberOnLoginOptions): Promise<void>
{
  const { prisma, customApi, namespace, host, log } = opts;
  const subject = opts.subject?.trim() ?? "";
  const email = opts.email?.trim() ?? "";

  if (!subject || !email)
  {
    // A per-org login always carries both; missing either is anomalous, not routine — but
    // there is nothing to key adoption on, so skip rather than write a partial row.
    log.warn({ hasSubject: Boolean(subject), hasEmail: Boolean(email) }, "member adoption skipped: login carries no subject/email");
    return;
  }

  // Only a per-org login proves org membership. A null resolution is a masters/platform login
  // (or dev/test with no cluster wired) — there is no org to adopt into, so skip silently.
  const perOrg = await _ResolvePerOrgClient(customApi, host, log);
  if (!perOrg)
  {
    return;
  }
  const orgName = perOrg.clusterTenant;
  const ownerBySubject = perOrg.ownerSubject === subject;
  const ownerByEmail = !perOrg.ownerSubject && perOrg.ownerEmail === email.toLowerCase();
  const role = ownerBySubject || ownerByEmail ? "Owner" : "Member";

  // 1. Materialize the CR's trusted owner as Owner, or admit an authenticated member.
  await prisma.orgMembership.upsert({
    where: { clusterTenant_subject: { clusterTenant: orgName, subject } },
    create: { clusterTenant: orgName, subject, role },
    update: {},
  });

  // 2. Seed the member's subject-bound workspace after the local membership exists.
  const seed = await _EnsureMemberTenant({ customApi, prisma, namespace, orgName, email, subject });
  if (seed.created)
  {
    log.info({ orgName, tenantName: seed.tenantName, email }, "seeded member workspace on first login");
  }
  else if (seed.skippedReason)
  {
    log.info({ orgName, tenantName: seed.tenantName, skippedReason: seed.skippedReason }, "member workspace seed skipped on login");
  }
}
