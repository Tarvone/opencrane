import type { OrgMembershipFacts, OrgMembershipReader, OwnedOrg } from "./org-membership.types.js";

export type { OrgMembershipFacts, OrgMembershipReader, OrgMembershipRow, OwnedOrg } from "./org-membership.types.js";

/** Empty (fail-closed) facts: no admin authority, no org scope. */
const _EMPTY: OrgMembershipFacts = { isOrgAdmin: false, ownedOrgs: [] };

/**
 * Resolve the caller's org-admin facts from their `OrgMembership` rows, fail-closed.
 *
 * The single source of truth for membership-derived authority, so the rule cannot
 * drift between `/auth/me` (introspection) and the cluster-tenant guard (enforcement):
 *
 *   - A subject who holds `owner` or `admin` on ≥1 org IS an org admin, scoped to
 *     exactly those orgs.
 *   - `member` rows confer no admin authority and are excluded from the scope.
 *   - A missing subject, no rows, or any lookup failure ⇒ empty facts (no authority).
 *
 * Keyed on the IdP-verified subject (OIDC `sub`), never request input.
 *
 * @param reader  - A client exposing the minimal `OrgMembership` read surface.
 * @param subject - The caller's IdP-verified subject; empty/undefined ⇒ empty facts.
 * @returns The derived org-admin flag and the owned/administered org set.
 */
export async function _ResolveOrgMembershipFacts(reader: OrgMembershipReader, subject: string | undefined): Promise<OrgMembershipFacts>
{
  const normalized = typeof subject === "string" ? subject.trim() : "";
  if (!normalized)
  {
    return _EMPTY;
  }

  try
  {
    const rows = await reader.orgMembership.findMany({
      where: { subject: normalized, role: { in: ["Owner", "Admin"] } },
      select: { clusterTenant: true, role: true },
      orderBy: { clusterTenant: "asc" },
    });

    const ownedOrgs: OwnedOrg[] = rows.map(function _toOwned(row)
    {
      return { clusterTenant: row.clusterTenant, role: row.role === "Owner" ? "owner" : "admin" };
    });

    return { isOrgAdmin: ownedOrgs.length > 0, ownedOrgs };
  }
  catch
  {
    // Fail closed: a lookup failure must never silently grant org-admin authority.
    return _EMPTY;
  }
}
