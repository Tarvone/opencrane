import { ChangeDetectionStrategy, Component, Signal, computed, input, output } from "@angular/core";

import { SettingsFormFeedback, SettingsFormFeedbackKind, SettingsFormPhase, SettingsFormState, _CanSubmitSettingsForm, _SettingsFormFeedback } from "@opencrane/core";

/** Controlled settings save and recovery actions with accessible status feedback. */
@Component({
	selector: "wo-save-button",
	standalone: true,
	templateUrl: "./save-button.component.html",
	styleUrl: "./save-button.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SaveButtonComponent
{
	/** External form state; the component never manufactures mutation success. */
	public readonly state = input<SettingsFormState<unknown> | undefined>(undefined);

	/** Emitted when a valid dirty draft should be submitted. */
	public readonly submitIntent = output<void>();

	/** Emitted when the owner should restore its accepted baseline. */
	public readonly resetIntent = output<void>();

	/** Emitted when the owner should accept the latest stored conflict value. */
	public readonly reloadLatestIntent = output<void>();

	/** Emitted when the owner should resume editing its preserved conflict draft. */
	public readonly returnToEditingIntent = output<void>();

	/** Form phase enum exposed to the external template. */
	public readonly SettingsFormPhase = SettingsFormPhase;

	/** Feedback kind enum exposed to the external template. */
	public readonly SettingsFormFeedbackKind = SettingsFormFeedbackKind;

	/** Whether submit or retry intent is currently allowed. */
	public readonly canSubmit: Signal<boolean> = computed((): boolean =>
	{
		const state = this.state();
		return state === undefined || _CanSubmitSettingsForm(state);
	});

	/** Whether all form controls and duplicate submission must remain locked. */
	public readonly pending: Signal<boolean> = computed((): boolean => this.state()?.phase === SettingsFormPhase.Pending);

	/** Accessible feedback guaranteed by success, conflict, and error phases. */
	public readonly feedback: Signal<SettingsFormFeedback | undefined> = computed((): SettingsFormFeedback | undefined =>
	{
		const state = this.state();
		return state === undefined ? undefined : _SettingsFormFeedback(state);
	});

	/** Whether baseline reset is relevant for the current draft. */
	public readonly canReset: Signal<boolean> = computed((): boolean =>
	{
		const phase = this.state()?.phase;
		return phase === SettingsFormPhase.Dirty || phase === SettingsFormPhase.Invalid || phase === SettingsFormPhase.RecoverableError;
	});

	/** Emit submit intent only when the external contract permits it. */
	public submit(): void
	{
		if (this.canSubmit())
		{
			this.submitIntent.emit();
		}
	}
}
