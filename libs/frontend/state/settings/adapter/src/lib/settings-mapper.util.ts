import { DatasetAccess, EgressDomain, ScopeLevel } from "@opencrane/core";

import { AccountProfile, AccountProfileUpdate, AwarenessContractInfo, BudgetSpend, PodIdentity } from "./settings-gateway.types";
import type { AccountTenantPatch, AccountTenantWire, BudgetSpendWire, DatasetsWire, EffectiveContractWire, PodTenantWire, PolicyWire } from "./settings-mapper.types";

/**
 * Map a wire `Tenant` onto the Account read model.
 *
 * Pure and DI-free so it can be unit-tested directly. Optional wire fields
 * collapse to empty strings; `fallbackName` backstops a missing wire `name`
 * (the caller already knows the tenant it requested).
 *
 * @param wire         - Tenant identity fields as returned by the API.
 * @param fallbackName - Tenant name to use when the wire omits one.
 */
export function _MapAccountProfile(wire: AccountTenantWire, fallbackName: string): AccountProfile
{
	return {
		name: wire.name ?? fallbackName,
		fullName: wire.displayName ?? "",
		email: wire.email ?? "",
		department: wire.team ?? ""
	};
}

/**
 * Map an Account update onto the `PUT /tenants/{name}` patch body.
 *
 * Pure and DI-free so it can be unit-tested directly. Only the fields actually
 * supplied in `update` are emitted (a `fullName`/`department` of `undefined`
 * yields no key), keeping the wire patch minimal and the unspecified fields
 * untouched server-side.
 *
 * @param update - Editable Account fields to persist.
 */
export function _MapAccountUpdateToTenantPatch(update: AccountProfileUpdate): AccountTenantPatch
{
	const patch: AccountTenantPatch = {};
	if (update.fullName !== undefined)
	{
		patch.displayName = update.fullName;
	}
	if (update.department !== undefined)
	{
		patch.team = update.department;
	}
	return patch;
}

/**
 * Map a contract scope token onto the UI {@link ScopeLevel}.
 *
 * The contract uses `team` where the UI scope is `dept`; every other token maps
 * by value. Unknown tokens fall back to personal (the most-restricted scope).
 */
function _ScopeFromWire(scope: string | undefined): ScopeLevel
{
	switch (scope)
	{
		case "org": return ScopeLevel.Org;
		case "team": return ScopeLevel.Dept;
		case "project": return ScopeLevel.Project;
		case "personal": return ScopeLevel.Personal;
		default: return ScopeLevel.Personal;
	}
}

/**
 * Map a wire `Tenant` onto the Pod identity read model.
 *
 * Pure and DI-free. Optional wire fields collapse to empty strings;
 * `fallbackName` backstops a missing wire `name`.
 *
 * @param wire         - Tenant fields as returned by the API.
 * @param fallbackName - Tenant name to use when the wire omits one.
 */
export function _MapPodIdentity(wire: PodTenantWire, fallbackName: string): PodIdentity
{
	return {
		name: wire.name ?? fallbackName,
		displayName: wire.displayName ?? "",
		email: wire.email ?? "",
		team: wire.team ?? "",
		phase: wire.phase ?? "",
		ingressHost: wire.ingressHost ?? "",
		createdAt: wire.createdAt ?? ""
	};
}

/**
 * Map a wire spend payload onto the Budget read model.
 *
 * Pure and DI-free. Missing figures collapse to `0`; an unrecognised alert band
 * falls back to `ok`.
 *
 * @param wire - Spend fields as returned by the API.
 */
export function _MapBudgetSpend(wire: BudgetSpendWire): BudgetSpend
{
	const alert = wire.budgetAlertState;
	return {
		monthlyLimitUsd: wire.monthlyLimitUsd ?? 0,
		currentSpendUsd: wire.currentSpendUsd ?? 0,
		alertState: alert === "warning" || alert === "exceeded" ? alert : "ok"
	};
}

/**
 * Map a wire effective-contract payload onto the Awareness identity read model.
 *
 * Pure and DI-free. Missing fields collapse to empty strings.
 *
 * @param wire - Effective-contract fields as returned by the API.
 */
export function _MapAwarenessContract(wire: EffectiveContractWire): AwarenessContractInfo
{
	return {
		contractId: wire.contractId ?? "",
		contractVersion: wire.contractVersion ?? ""
	};
}

/**
 * Map the scoped dataset-name lists onto Access membership rows.
 *
 * Pure and DI-free. The contract exposes only names per scope, so access mode,
 * entry counts and grant dates are not known here and are left as neutral
 * defaults (`read` / `0` / `—`); the names themselves are authoritative.
 *
 * @param wire - Scoped dataset-name lists as returned by the API.
 */
export function _MapDatasetAccess(wire: DatasetsWire): DatasetAccess[]
{
	const rows: DatasetAccess[] = [];
	const scopes: { key: keyof DatasetsWire; scope: ScopeLevel }[] =
	[
		{ key: "org", scope: ScopeLevel.Org },
		{ key: "team", scope: ScopeLevel.Dept },
		{ key: "project", scope: ScopeLevel.Project },
		{ key: "personal", scope: ScopeLevel.Personal }
	];
	for (const { key, scope } of scopes)
	{
		for (const name of wire[key] ?? [])
		{
			rows.push({ name, scope, access: "read", entries: 0, granted: "—" });
		}
	}
	return rows;
}

/**
 * Flatten network policies onto egress-allowlist rows.
 *
 * Pure and DI-free. Each policy domain becomes one row; the originating policy
 * name is surfaced as the row purpose. Rows are deduplicated by domain (first
 * policy wins). Status is reported `active` — the contract has no per-domain
 * lifecycle field.
 *
 * @param wire - Policy rows as returned by the API.
 */
export function _MapEgressDomains(wire: PolicyWire[]): EgressDomain[]
{
	const seen = new Set<string>();
	const rows: EgressDomain[] = [];
	for (const policy of wire)
	{
		for (const domain of policy.domains ?? [])
		{
			if (seen.has(domain))
			{
				continue;
			}
			seen.add(domain);
			rows.push({ domain, purpose: policy.name ?? "Network policy", status: "active" });
		}
	}
	return rows;
}
