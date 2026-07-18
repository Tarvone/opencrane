/** The forward target the control plane authorises for a session. */
export interface ResolvedTarget
{
  /** Verified identity replayed to the tenant gateway. */
  user: { email: string; sub: string };
  /** Sole tenant selected by the control plane. */
  tenant: { name: string; clusterTenantRef: string | null };
  /** In-cluster Service coordinate for the selected tenant. */
  podService: { name: string; namespace: string };
}

/** Delegated-auth outcome: a forward target, or a closed-socket status and reason. */
export type ResolveOutcome =
  | { ok: true; target: ResolvedTarget }
  | { ok: false; status: number; reason: string };
