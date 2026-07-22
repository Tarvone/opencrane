/** Decoded state persisted in the fixed Cognee silo-owner Secret. */
export interface CogneeSiloOwnerState
{
  /** Cognee owner login name. */
  username: string;
  /** Cognee owner login password. */
  password: string;
  /** Cognee Tenant id; empty until the singleton tenant resolves. */
  tenantId: string;
}
