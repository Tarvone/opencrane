import { InjectionToken } from "@angular/core";

import { DatasetAccess, EgressDomain, SkillRow } from "@opencrane/core";

/**
 * Read model for the Account settings section.
 *
 * Mirrors the identity fields the OpenCrane `Tenant` contract exposes for a pod
 * (`/tenants/{name}`) and that the Account section renders: full name, the
 * org-managed email, and the team the pod belongs to. WeOwnAI is a pure network
 * client and never imports OpenCrane source — this is a local projection of the
 * wire shape, not a re-export of it.
 */
export interface AccountProfile
{
	/** Stable pod/tenant identifier the profile was loaded for. */
	name: string;

	/** Display name shown in the "Full name" field. */
	fullName: string;

	/** Org-managed email address (read-only in the section). */
	email: string;

	/** Team the pod belongs to, surfaced as "Department". */
	department: string;

	/** Role of the user in the workspace. */
	role: string;
}

/**
 * Editable subset of {@link AccountProfile} the Account/Pod section can persist.
 *
 * Only the writable identity fields appear: `email` is org-managed and read-only
 * in the section, and `name` is the immutable pod key (the path param), so
 * neither is updatable here. Both fields are optional so a caller can patch one
 * without the other (maps onto the partial `PUT /tenants/{name}` body).
 */
export interface AccountProfileUpdate
{
	/** New display name ("Full name"), when changing it. */
	fullName?: string;

	/** New team ("Department"), when changing it. */
	department?: string;
}

/**
 * Read model for the Model & Budget section's live spend figures.
 *
 * Local projection of `GET /ai-budget/{tenantName}/spend`. The model catalogue
 * and routing classes the section also renders are static configuration, not
 * part of this per-tenant read.
 */
/** A single by-model-class spend row. */
export interface ModelClassSpend
{
	/** Display name for the model class (e.g. "Writing"). */
	className: string;

	/** Comma-separated model names used for this class (e.g. "claude-sonnet-4-6"). */
	modelNames: string;

	/** Spend for this class in USD. */
	spendUsd: number;

	/** Percentage of total spend (0–100). */
	percentage: number;
}

/** Personal budget read model containing spend limit and active breakdown. */
export interface BudgetSpend
{
	/** Monthly spend ceiling in USD. */
	monthlyLimitUsd: number;

	/** Spend so far this month in USD. */
	currentSpendUsd: number;

	/** Budget alert band derived server-side. */
	alertState: "ok" | "warning" | "exceeded";

	/** Spend breakdown by model class, ordered by spend descending. */
	modelClasses: ModelClassSpend[];

	/** ISO date string of next monthly reset (e.g. "Jul 1"). */
	resetDate: string;
}

/**
 * Read model for the Awareness Contract section's identity banner.
 *
 * Local projection of the typed fields on `GET /tenants/{name}/effective-contract`
 * (`contractId`, `contractVersion`); the nested `awareness`/`mcp`/`skills` blocks
 * are opaque in the pinned contract, so the rich per-dataset Cognee stats the
 * section also shows remain fixture-backed until an endpoint exposes them.
 */
export interface AwarenessContractInfo
{
	/** Stable contract identifier. */
	contractId: string;

	/** Resolved contract version string (e.g. `v2.3.1`). */
	contractVersion: string;

	/** Fallback behaviour when Cognee is unreachable mid-loop. */
	fallbackBehaviour: "proceed" | "pause" | "abort";

	/** Whether citation mode is enabled on grounded responses. */
	citationMode: boolean;
}

/**
 * Abstraction over the OpenCrane settings reads/writes backing the operator
 * app's settings sections.
 *
 * Components depend only on this interface, so the data source can be swapped
 * (mock fixtures → live OpenCrane client, web → desktop) without touching the
 * section components. Implementations live in this `adapter` lib; the binding is
 * provided in the app's `app.config.ts`. Carries the live-backed sections that
 * still read through the gateway; sections that are mock-only stay fixture-based
 * until their issue scope calls for a backend projection.
 */
export interface SettingsGateway
{
	/**
	 * Load the account profile for a pod by its tenant name.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getAccountProfile(tenantName: string): Promise<AccountProfile>;

	/**
	 * Persist edits to a pod's account profile and resolve with the saved profile.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param update     - The fields to change (see {@link AccountProfileUpdate}).
	 */
	updateAccountProfile(tenantName: string, update: AccountProfileUpdate): Promise<AccountProfile>;

	/**
	 * Load a pod's live monthly spend for the Model & Budget section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getBudgetSpend(tenantName: string): Promise<BudgetSpend>;

	/**
	 * Load a pod's effective awareness-contract identity for the Awareness section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getAwarenessContract(tenantName: string): Promise<AwarenessContractInfo>;

	/**
	 * Load a pod's dataset memberships for the Access & Datasets section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getDatasetAccess(tenantName: string): Promise<DatasetAccess[]>;

	/**
	 * Load the skill catalogue rows for the Skills section.
	 *
	 * Cluster-wide (`GET /skills/catalog`), so it takes no tenant key.
	 */
	getSkills(): Promise<SkillRow[]>;

	/**
	 * Load the egress allowlist rows for the Network & Egress section.
	 *
	 * Flattened from the cluster network policies (`GET /policies`).
	 */
	getEgressDomains(): Promise<EgressDomain[]>;
}

/** DI token for the active SettingsGateway implementation. */
export const SETTINGS_GATEWAY: InjectionToken<SettingsGateway> = new InjectionToken<SettingsGateway>("WO_SETTINGS_GATEWAY");
