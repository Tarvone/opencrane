import { SettingsValidationErrors } from "@opencrane/core";

import { WorkspaceBudgetDraft, WorkspaceBudgetMember, WorkspaceBudgetStatus, WorkspaceBudgetTotals, WorkspaceBudgetUsage } from "./budgets-section.types.js";

/** Sum the immutable spend and editable allocations shown by the handoff summary. */
export function _WorkspaceBudgetTotals(members: readonly WorkspaceBudgetMember[], draft: WorkspaceBudgetDraft): WorkspaceBudgetTotals
{
	return {
		spent: members.reduce(function sumSpend(total, member): number { return total + member.spent; }, 0),
		allocated: Object.values(draft.limits).reduce(function sumLimits(total, limit): number { return total + (Number.isFinite(limit) ? limit : 0); }, 0)
	};
}

/** Derive safe progress and threshold state without dividing by zero. */
export function _WorkspaceBudgetUsage(spent: number, limit: number): WorkspaceBudgetUsage
{
	const percentage = limit === 0 ? (spent > 0 ? 100 : 0) : Math.max(0, Math.round((spent / limit) * 100));
	const barPercentage = Math.min(percentage, 100);
	if (percentage >= 100) return { percentage, barPercentage, status: WorkspaceBudgetStatus.Exceeded, label: "Exceeded" };
	if (percentage >= 80) return { percentage, barPercentage, status: WorkspaceBudgetStatus.Warning, label: "Near limit" };
	return { percentage, barPercentage, status: WorkspaceBudgetStatus.Normal, label: "On track" };
}

/** Validate every member limit while preserving sibling draft values. */
export function _WorkspaceBudgetValidationErrors(draft: WorkspaceBudgetDraft): SettingsValidationErrors
{
	const errors: Record<string, string> = {};
	for (const [memberId, limit] of Object.entries(draft.limits))
	{
		if (!Number.isFinite(limit) || limit < 0) errors[memberId] = "Enter a monthly limit of zero or more.";
	}
	return errors;
}
