import { SettingsNavigationDecision } from "@opencrane/core";

import { MembersSectionComponent } from "./members-section.component.js";

/** Shared confirmation prompt for leaving a dirty Members editor. */
const MEMBERS_NAVIGATION_CONFIRMATION =
{
	/** Ask the user before discarding an incomplete or unsaved editor draft. */
	confirmDiscardChanges: function confirmDiscardChanges(): boolean
	{
		return confirm("Discard your unsaved Members changes?");
	}
};

/** Protect Members editor routes from losing unsaved changes. */
export function _CanDeactivateMembersSection(component: MembersSectionComponent): SettingsNavigationDecision
{
	return component.canDeactivate(MEMBERS_NAVIGATION_CONFIRMATION);
}
