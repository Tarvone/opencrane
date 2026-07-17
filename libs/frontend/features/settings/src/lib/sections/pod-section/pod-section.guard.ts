import { SettingsNavigationDecision, SettingsUnsavedNavigationConfirmation } from "@opencrane/core";
import type { PodSectionComponent } from "./pod-section.component.js";

/** Browser confirmation boundary for abandoning unsaved Pod settings. */
const POD_NAVIGATION_CONFIRMATION: SettingsUnsavedNavigationConfirmation =
{
	confirmDiscardChanges: function confirmDiscardChanges(): boolean
	{
		return globalThis.confirm("Discard your unsaved Pod settings changes?");
	}
};

/** Protect the Pod route whenever its shared form contract reports unsaved work. */
export function _CanDeactivatePodSection(component: PodSectionComponent): SettingsNavigationDecision
{
	return component.canDeactivate(POD_NAVIGATION_CONFIRMATION);
}
