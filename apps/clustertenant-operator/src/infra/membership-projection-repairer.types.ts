/**
 * Types for the fleet → silo OrgMembership projection repairer (#126 S2).
 */

/** A single membership as returned by the fleet internal endpoint. */
export interface FleetMembershipRow
{
  /** IdP-verified subject (OIDC `sub`) holding the membership. */
  subject: string;
  /** Role held within the org (Owner | Admin | Member). */
  role: string;
}

/**
 * Reader over the fleet's authoritative org membership. The default HTTP implementation
 * pulls from the fleet internal endpoint; tests inject a fake. A reader returns `null`
 * to signal "source unavailable" (unconfigured / unreachable / non-OK), which the
 * repairer treats as a safe no-op — it never wipes the local rows on an empty read it
 * cannot trust.
 */
export interface FleetMembershipReader
{
  /**
   * Read the org's authoritative memberships from the fleet, or null when the source
   * is unavailable (so the repairer no-ops rather than deleting local rows).
   *
   * @param clusterTenant - The org (ClusterTenant) whose membership to read.
   */
  read(clusterTenant: string): Promise<FleetMembershipRow[] | null>;
}
