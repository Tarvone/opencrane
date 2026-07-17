/**
 * Wire shape of the OpenCrane `Tenant` identity fields the Account section reads.
 *
 * A local projection of the generated `Tenant` contract — only the fields the
 * mapping consumes are declared, all optional as the contract marks them.
 */
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

	/** Role of the user in the workspace. */
	role?: string;
}

/**
 * Patch shape for `PUT /tenants/{name}` — the writable identity fields only.
 *
 * A local projection of the contract's update body; the section never writes
 * `email` (org-managed) or `name` (the immutable path key), so neither appears.
 * Keys are present only when the corresponding edit was supplied, so the request
 * stays a minimal partial update.
 */
export interface AccountTenantPatch
{
	/** New display name, when changing it. */
	displayName?: string;

	/** New team, when changing it. */
	team?: string;
}

/**
 * Wire shape of `GET /ai-budget/{tenantName}/spend`.
 *
 * Local projection; fields optional as the contract marks them.
 */
export interface BudgetSpendWire
{
	/** Monthly spend ceiling in USD. */
	monthlyLimitUsd?: number;

	/** Spend so far this month in USD. */
	currentSpendUsd?: number;

	/** Alert band (`ok` | `warning` | `exceeded`). */
	budgetAlertState?: string;

	/** Array of spend objects per model class. */
	modelClasses?: Array<{ className?: string; modelNames?: string; spendUsd?: number; percentage?: number; }>;

	/** Date string for the next budget reset. */
	resetDate?: string;
}

/**
 * Wire shape of the typed fields on `GET /tenants/{name}/effective-contract`.
 *
 * Only the flat identity fields are projected; the nested `awareness`/`mcp`/
 * `skills` blocks are opaque in the pinned contract.
 */
export interface EffectiveContractWire
{
	/** Stable contract identifier. */
	contractId?: string;

	/** Resolved contract version string. */
	contractVersion?: string;

	/** Fallback behaviour when Cognee is unreachable mid-loop. */
	fallbackBehaviour?: "proceed" | "pause" | "abort";

	/** Whether citation mode is enabled on grounded responses. */
	citationMode?: boolean;
}

/**
 * Wire shape of `GET /tenants/{name}/datasets` — dataset names grouped by scope.
 */
export interface DatasetsWire
{
	/** Org-scope dataset names. */
	org?: string[];

	/** Team (dept)-scope dataset names. */
	team?: string[];

	/** Project-scope dataset names. */
	project?: string[];

	/** Personal-scope dataset names. */
	personal?: string[];
}

/**
 * Wire shape of a `GET /skills/catalog` row.
 *
 * Local projection of the fields the Skills table renders.
 */
export interface SkillCatalogWire
{
	/** Skill name. */
	name?: string;

	/** Version string. */
	version?: string;

	/** OCI digest. */
	digest?: string;

	/** Scope token (`org` | `team` | `project` | `personal`). */
	scope?: string;

	/** Publication status (`draft` | `published` | `deprecated`). */
	status?: string;
}

/**
 * Wire shape of a `GET /policies` row.
 *
 * Local projection of the fields the egress allowlist renders.
 */
export interface PolicyWire
{
	/** Policy name. */
	name?: string;

	/** Allowed egress domains. */
	domains?: string[];
}
