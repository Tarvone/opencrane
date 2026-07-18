import { describe, expect, it } from "vitest";

import { WORKSPACE_BUDGET_DRAFT_FIXTURE, WORKSPACE_BUDGET_MEMBERS_FIXTURE } from "./budgets-section.fixtures.js";
import { WorkspaceBudgetStatus } from "./budgets-section.types.js";
import { _WorkspaceBudgetTotals, _WorkspaceBudgetUsage, _WorkspaceBudgetValidationErrors } from "./budgets-section.utils.js";

describe("workspace budget utilities", function workspaceBudgetUtilities(): void
{
	it("derives the exact handoff organization totals", function totals(): void
	{
		expect(_WorkspaceBudgetTotals(WORKSPACE_BUDGET_MEMBERS_FIXTURE, WORKSPACE_BUDGET_DRAFT_FIXTURE)).toEqual({ spent: 273, allocated: 350 });
	});

	it("handles zero limits without division and classifies non-zero spend as exceeded", function zeroLimit(): void
	{
		expect(_WorkspaceBudgetUsage(0, 0)).toEqual({ percentage: 0, barPercentage: 0, status: WorkspaceBudgetStatus.Normal, label: "On track" });
		expect(_WorkspaceBudgetUsage(8, 0)).toEqual({ percentage: 100, barPercentage: 100, status: WorkspaceBudgetStatus.Exceeded, label: "Exceeded" });
	});

	it("keeps the eighty and one-hundred percent thresholds deterministic", function thresholds(): void
	{
		expect(_WorkspaceBudgetUsage(79, 100).status).toBe(WorkspaceBudgetStatus.Normal);
		expect(_WorkspaceBudgetUsage(80, 100).status).toBe(WorkspaceBudgetStatus.Warning);
		expect(_WorkspaceBudgetUsage(99, 100).status).toBe(WorkspaceBudgetStatus.Warning);
		expect(_WorkspaceBudgetUsage(100, 100).status).toBe(WorkspaceBudgetStatus.Exceeded);
		expect(_WorkspaceBudgetUsage(120, 100).barPercentage).toBe(100);
	});

	it("accepts zero and rejects negative or non-finite limits", function validation(): void
	{
		expect(_WorkspaceBudgetValidationErrors({ limits: { valid: 0 } })).toEqual({});
		expect(_WorkspaceBudgetValidationErrors({ limits: { negative: -1, empty: Number.NaN } })).toEqual({ negative: "Enter a monthly limit of zero or more.", empty: "Enter a monthly limit of zero or more." });
	});
});
