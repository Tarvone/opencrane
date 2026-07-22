/** Wire shape of the OpenCrane Tenant identity fields the Account section reads. */
export interface AccountTenantWire
{
	/** Stable tenant identifier. */
	name?: string;
	/** Human-readable display name. */
	displayName?: string;
	/** Org-managed email address. */
	email?: string;
	/** Team the tenant belongs to. */
	team?: string;
}

/** Patch shape for PUT /tenants/{name}. */
export interface AccountTenantPatch
{
	/** New display name, when changing it. */
	displayName?: string;
	/** New team, when changing it. */
	team?: string;
}

/** Wire shape of GET /tenants/{name} for the Pod and Session section. */
export interface PodTenantWire
{
	/** Stable tenant identifier. */
	name?: string;
	/** Human-readable display name. */
	displayName?: string;
	/** Org-managed email address. */
	email?: string;
	/** Team the tenant belongs to. */
	team?: string;
	/** Lifecycle phase. */
	phase?: string;
	/** Ingress host the pod is reachable on. */
	ingressHost?: string;
	/** ISO creation timestamp. */
	createdAt?: string;
}

/** Wire shape of GET /ai-budget/{tenantName}/spend. */
export interface BudgetSpendWire
{
	/** Monthly spend ceiling in USD. */
	monthlyLimitUsd?: number;
	/** Spend so far this month in USD. */
	currentSpendUsd?: number;
	/** Alert band. */
	budgetAlertState?: string;
}

/** Wire shape of the typed fields on GET /tenants/{name}/effective-contract. */
export interface EffectiveContractWire
{
	/** Stable contract identifier. */
	contractId?: string;
	/** Resolved contract version string. */
	contractVersion?: string;
}

/** Wire shape of GET /tenants/{name}/datasets. */
export interface DatasetsWire
{
	/** Org-scope dataset names. */
	org?: string[];
	/** Team-scope dataset names. */
	team?: string[];
	/** Project-scope dataset names. */
	project?: string[];
	/** Personal-scope dataset names. */
	personal?: string[];
}

/** Wire shape of one GET /policies row. */
export interface PolicyWire
{
	/** Policy name. */
	name?: string;
	/** Allowed egress domains. */
	domains?: string[];
}
