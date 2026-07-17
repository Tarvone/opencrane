import { ChangeDetectionStrategy, Component, Signal, computed, signal } from "@angular/core";

import { SettingsFormPhase, SettingsFormState, SettingsMutation, SettingsMutationOutcome, SettingsNavigationDecision, SettingsUnsavedNavigationConfirmation, SettingsValidationErrors, _ConfirmSettingsNavigation, _CreateSettingsFormState, _EditSettingsForm, _ReloadLatestSettingsForm, _ResetSettingsForm, _ResolveSettingsForm, _ReturnToEditingSettingsForm, _SubmitSettingsForm } from "@opencrane/core";
import { POD_SETTINGS_FIXTURE, POD_SETTINGS_SUCCESS_MUTATION, PodSettingsDraftFixture } from "@opencrane/core/testing";
import { SaveButtonComponent, SectionHeadingComponent, SettingsRowComponent, ToggleFieldComponent } from "@opencrane/elements/ui";

/** Validate the two required text fields without replacing valid sibling input. */
function _validationErrors(draft: PodSettingsDraftFixture): SettingsValidationErrors
{
	const errors: Record<string, string> = {};
	if (draft.displayName.trim().length === 0) errors["displayName"] = "Enter a display name.";
	if (draft.version.trim().length === 0) errors["version"] = "Enter an OpenCrane version.";
	return errors;
}

/** Extract a text value from one native settings input event. */
function _inputValue(event: Event): string
{
	return (event.target as HTMLInputElement).value;
}

/** Fixture-backed Workspace Pod settings form. */
@Component({
	selector: "wo-pod-section",
	standalone: true,
	imports: [SectionHeadingComponent, SettingsRowComponent, SaveButtonComponent, ToggleFieldComponent],
	templateUrl: "./pod-section.component.html",
	styleUrl: "./pod-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class PodSectionComponent
{
	/** Read-only handoff values and editable baseline. */
	public readonly pod = POD_SETTINGS_FIXTURE;

	/** Controlled lifecycle for all editable Pod values. */
	public readonly formState = signal<SettingsFormState<PodSettingsDraftFixture>>(_CreateSettingsFormState(POD_SETTINGS_FIXTURE.draft));

	/** Deterministic mutation boundary replaceable by focused tests. */
	public mutation: SettingsMutation<PodSettingsDraftFixture> = POD_SETTINGS_SUCCESS_MUTATION;

	/** Whether every form control must stay locked for the captured attempt. */
	public readonly pending: Signal<boolean> = computed((): boolean => this.formState().phase === SettingsFormPhase.Pending);

	/** Apply a display-name edit and derive the next validation state. */
	public editDisplayName(event: Event): void
	{
		this._edit({ ...this.formState().draft, displayName: _inputValue(event) });
	}

	/** Apply a version edit and derive the next validation state. */
	public editVersion(event: Event): void
	{
		this._edit({ ...this.formState().draft, version: _inputValue(event) });
	}

	/** Include an auto-update change in the same controlled draft. */
	public editAutoUpdate(autoUpdate: boolean): void
	{
		this._edit({ ...this.formState().draft, autoUpdate });
	}

	/** Capture and submit one valid draft while preventing duplicate attempts. */
	public async submit(): Promise<void>
	{
		// 1. Capture the valid draft so later interactions cannot alter the active attempt.
		const currentState = this.formState();
		if (currentState.phase === SettingsFormPhase.Pending) return;
		const pendingState = _SubmitSettingsForm(currentState);
		if (pendingState.phase !== SettingsFormPhase.Pending) return;
		this.formState.set(pendingState);

		// 2. Resolve the deterministic mutation into explicit success or recovery state.
		try
		{
			const result = await this.mutation.mutate(pendingState.pendingDraft);
			this.formState.update(function resolve(state): SettingsFormState<PodSettingsDraftFixture>
			{
				return _ResolveSettingsForm(state, result);
			});
		}
		catch (error)
		{
			const message = error instanceof Error ? error.message : "Failed to save Pod settings.";
			this.formState.update(function resolve(state): SettingsFormState<PodSettingsDraftFixture>
			{
				return _ResolveSettingsForm(state, { outcome: SettingsMutationOutcome.RecoverableError, message });
			});
		}
	}

	/** Restore the last accepted Pod baseline. */
	public reset(): void
	{
		this.formState.update(_ResetSettingsForm);
	}

	/** Accept the stored value exposed by a conflict. */
	public reloadLatest(): void
	{
		this.formState.update(_ReloadLatestSettingsForm);
	}

	/** Resume editing the user draft preserved by a conflict. */
	public returnToEditing(): void
	{
		this.formState.update(_ReturnToEditingSettingsForm);
	}

	/** Delegate unsafe navigation decisions to the shared confirmation boundary. */
	public canDeactivate(confirmation: SettingsUnsavedNavigationConfirmation): SettingsNavigationDecision
	{
		return _ConfirmSettingsNavigation(this.formState(), confirmation);
	}

	/** Apply one draft edit unless a pending mutation owns the controls. */
	private _edit(draft: PodSettingsDraftFixture): void
	{
		this.formState.update(function applyEdit(state): SettingsFormState<PodSettingsDraftFixture>
		{
			return _EditSettingsForm(state, draft, _validationErrors(draft));
		});
	}
}
