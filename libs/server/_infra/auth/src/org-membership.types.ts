/**
 * Minimal structural view of the rows the organisation-membership resolver reads. Both managers'
 * Prisma clients expose an `OrgMembership` model with these fields, so each can pass its own
 * (otherwise divergent) client without the lib depending on a concrete generated client.
 */
export interface OrgMembershipRow
{
  /** The organisation (ClusterTenant) key. */
  clusterTenant: string;

  /** The membership role as stored (`Owner` | `Admin` | `Member`). */
  role: string;
}

/**
 * The minimal `OrgMembership` read surface the membership resolver needs. The `findMany`
 * argument is typed `unknown` so each manager's full (and otherwise divergent) Prisma client
 * is assignable here — the lib supplies the concrete query object at the call site, and the
 * narrowed `OrgMembershipRow[]` return is what the resolver relies on.
 */
export interface OrgMembershipReader
{
  /** Organisation-membership query surface used by the resolver. */
  orgMembership: {
    /** Find memberships using the resolver-owned query. */
    findMany(args: unknown): Promise<OrgMembershipRow[]>;
  };
}

/** One organisation the caller administers, with the role they hold there. */
export interface OwnedOrg
{
  /** The organisation (ClusterTenant) key. */
  clusterTenant: string;

  /** The administering role the caller holds — `owner` or `admin`. */
  role: "owner" | "admin";
}

/**
 * The caller's membership-derived org-admin facts. Authority is derived purely
 * from `OrgMembership` rows, never from a global flag or a self-asserted claim.
 */
export interface OrgMembershipFacts
{
  /**
   * True iff the caller owns or administers at least one organisation — i.e. `ownedOrgs`
   * is non-empty. The membership-derived half of a session's `isOrgAdmin`.
   */
  isOrgAdmin: boolean;

  /**
   * The organisations the caller owns or administers (the org scope). Members
   * (role `member`) confer no admin authority and are excluded. Empty when the
   * caller administers no org.
   */
  ownedOrgs: OwnedOrg[];
}
