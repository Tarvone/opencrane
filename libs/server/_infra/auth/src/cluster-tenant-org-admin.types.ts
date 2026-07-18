/**
 * Minimal `BillingAccount` read surface the org-create billing gate needs. The `findUnique`
 * argument is typed `unknown` so each manager's full Prisma client is assignable; the lib
 * supplies the concrete query and relies only on the narrowed return.
 */
export interface BillingAccountReader
{
  /** Billing-account lookup surface used by the org-create gate. */
  billingAccount: {
    /** Find a billing account using the gate-owned query. */
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
}

/**
 * Minimal `OrgMembership` read surface the org-manager gate needs. Same `unknown`-argument
 * convention as {@link BillingAccountReader}.
 */
export interface OrgManagerReader
{
  /** Organisation-membership lookup surface used by the manager gate. */
  orgMembership: {
    /** Find a membership using the gate-owned query. */
    findUnique(args: unknown): Promise<{ role: string } | null>;
  };
}
