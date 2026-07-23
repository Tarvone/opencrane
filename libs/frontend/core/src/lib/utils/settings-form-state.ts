import { SettingsFormFeedback, SettingsFormFeedbackKind, SettingsFormPhase, SettingsMutationOutcome, SettingsMutationResult, SettingsFormState, SettingsNavigationDecision, SettingsUnsavedNavigationConfirmation, SettingsUnsavedNavigationSource, SettingsValidationErrors } from "../models/settings-form.types.js";

/** Create independent baseline and draft snapshots for a pristine form. */
export function _CreateSettingsFormState<TDraft>(baseline: TDraft): SettingsFormState<TDraft>
{
	return {
		phase: SettingsFormPhase.Pristine,
		baseline: structuredClone(baseline),
		draft: structuredClone(baseline),
		validationErrors: {}
	};
}

/** Apply a user edit and derive valid-dirty or invalid state. */
export function _EditSettingsForm<TDraft>(state: SettingsFormState<TDraft>, draft: TDraft, validationErrors: SettingsValidationErrors = {}): SettingsFormState<TDraft>
{
	if (state.phase === SettingsFormPhase.Pending)
	{
		return state;
	}
	if (Object.keys(validationErrors).length === 0 && JSON.stringify(draft) === JSON.stringify(state.baseline))
	{
		return _CreateSettingsFormState(state.baseline);
	}

	return {
		phase: Object.keys(validationErrors).length > 0 ? SettingsFormPhase.Invalid : SettingsFormPhase.Dirty,
		baseline: state.baseline,
		draft: structuredClone(draft),
		validationErrors
	};
}

/** Capture the valid draft for one mutation attempt and lock further edits. */
export function _SubmitSettingsForm<TDraft>(state: SettingsFormState<TDraft>): SettingsFormState<TDraft>
{
	if (!_CanSubmitSettingsForm(state))
	{
		return state;
	}

	return {
		phase: SettingsFormPhase.Pending,
		baseline: state.baseline,
		draft: state.draft,
		validationErrors: {},
		pendingDraft: structuredClone(state.draft),
	};
}

/** Resolve the active attempt without silently replacing its captured draft. */
export function _ResolveSettingsForm<TDraft>(state: SettingsFormState<TDraft>, result: SettingsMutationResult<TDraft>): SettingsFormState<TDraft>
{
	if (state.phase !== SettingsFormPhase.Pending)
	{
		return state;
	}

	switch (result.outcome)
	{
		case SettingsMutationOutcome.Success:
			return {
				phase: SettingsFormPhase.Success,
				baseline: structuredClone(result.accepted),
				draft: structuredClone(result.accepted),
				validationErrors: {},
				feedback: { kind: SettingsFormFeedbackKind.Success, message: result.message }
			};
		case SettingsMutationOutcome.Conflict:
			return {
				phase: SettingsFormPhase.Conflict,
				baseline: state.baseline,
				draft: state.pendingDraft,
				latest: structuredClone(result.latest),
				validationErrors: {},
				feedback: { kind: SettingsFormFeedbackKind.Conflict, message: result.message }
			};
		case SettingsMutationOutcome.RecoverableError:
			return {
				phase: SettingsFormPhase.RecoverableError,
				baseline: state.baseline,
				draft: state.pendingDraft,
				validationErrors: {},
				feedback: { kind: SettingsFormFeedbackKind.Error, message: result.message }
			};
	}
}

/** Restore the last accepted baseline unless a mutation is still pending. */
export function _ResetSettingsForm<TDraft>(state: SettingsFormState<TDraft>): SettingsFormState<TDraft>
{
	if (state.phase === SettingsFormPhase.Pending)
	{
		return state;
	}

	return _CreateSettingsFormState(state.baseline);
}

/** Accept the latest stored value after an explicit conflict reload. */
export function _ReloadLatestSettingsForm<TDraft>(state: SettingsFormState<TDraft>): SettingsFormState<TDraft>
{
	if (state.phase !== SettingsFormPhase.Conflict)
	{
		return state;
	}

	return _CreateSettingsFormState(state.latest);
}

/** Leave conflict recovery with the preserved user draft ready for editing. */
export function _ReturnToEditingSettingsForm<TDraft>(state: SettingsFormState<TDraft>): SettingsFormState<TDraft>
{
	if (state.phase !== SettingsFormPhase.Conflict)
	{
		return state;
	}

	return {
		phase: SettingsFormPhase.Dirty,
		baseline: state.baseline,
		draft: state.draft,
		validationErrors: {}
	};
}

/** Clear transient success feedback while retaining the accepted baseline. */
export function _DismissSettingsFormSuccess<TDraft>(state: SettingsFormState<TDraft>): SettingsFormState<TDraft>
{
	if (state.phase !== SettingsFormPhase.Success)
	{
		return state;
	}

	return _CreateSettingsFormState(state.baseline);
}

/** Determine whether the controlled save action may emit submit intent. */
export function _CanSubmitSettingsForm(state: SettingsUnsavedNavigationSource): boolean
{
	return state.phase === SettingsFormPhase.Dirty || state.phase === SettingsFormPhase.RecoverableError;
}

/** Read mutation feedback only from phases that guarantee its presence. */
export function _SettingsFormFeedback<TDraft>(state: SettingsFormState<TDraft>): SettingsFormFeedback | undefined
{
	switch (state.phase)
	{
		case SettingsFormPhase.Success:
		case SettingsFormPhase.Conflict:
		case SettingsFormPhase.RecoverableError:
			return state.feedback;
		default:
			return undefined;
	}
}

/** Determine whether route navigation needs the reusable unsaved-change confirmation. */
export function _ShouldConfirmUnsavedNavigation(source: SettingsUnsavedNavigationSource): boolean
{
	return source.phase === SettingsFormPhase.Dirty
		|| source.phase === SettingsFormPhase.Invalid
		|| source.phase === SettingsFormPhase.Conflict
		|| source.phase === SettingsFormPhase.RecoverableError;
}

/** Permit safe navigation immediately or delegate unsaved work to the host confirmation. */
export function _ConfirmSettingsNavigation(source: SettingsUnsavedNavigationSource, confirmation: SettingsUnsavedNavigationConfirmation): SettingsNavigationDecision
{
	if (!_ShouldConfirmUnsavedNavigation(source))
	{
		return true;
	}

	return confirmation.confirmDiscardChanges(source);
}
