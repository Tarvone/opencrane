import { SettingsNavigationDecision } from "@opencrane/core";

import { BudgetsSectionComponent } from "./budgets-section.component.js";

/** Browser confirmation boundary for unsaved Workspace Budget changes. */
const BUDGET_NAVIGATION_CONFIRMATION =
{
	/** Ask before discarding an edited or invalid budget draft. */
	confirmDiscardChanges: function confirmDiscardChanges(): boolean
	{
		return confirm("Discard your unsaved Budget changes?");
	}
};

/** Protect Workspace Budget edits from accidental route navigation. */
export function _CanDeactivateBudgetsSection(component: BudgetsSectionComponent): SettingsNavigationDecision
{
	return component.canDeactivate(BUDGET_NAVIGATION_CONFIRMATION);
}
