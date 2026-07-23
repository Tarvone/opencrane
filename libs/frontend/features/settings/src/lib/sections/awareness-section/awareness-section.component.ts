import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource, signal } from "@angular/core";

import { ActiveTenantStore } from "@opencrane/state/gateways";
import { AwarenessContractInfo, SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { SaveButtonComponent, SectionHeadingComponent, SettingsRowComponent, ToggleFieldComponent } from "@opencrane/elements/ui";
import { SettingsFormPhase, SettingsFormState, SettingsMutationOutcome, _CreateSettingsFormState, _EditSettingsForm, _ResolveSettingsForm, _SubmitSettingsForm } from "@opencrane/core";

interface AwarenessFormDraft
{
	fallbackBehaviour: "proceed" | "pause" | "abort";
	citationMode: boolean;
}

/** Awareness Contract settings section: Cognee scope datasets + retrieval. */
@Component({
	selector: "wo-awareness-section",
	standalone: true,
	imports: [SectionHeadingComponent, SettingsRowComponent, SaveButtonComponent, ToggleFieldComponent],
	templateUrl: "./awareness-section.component.html",
	styleUrl: "./awareness-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AwarenessSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Active pod/tenant name, resolved at the state level. */
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/** Managed form state covering pristine, dirty, pending, and conflict phases. */
	public readonly formState = signal<SettingsFormState<AwarenessFormDraft>>(_CreateSettingsFormState({
		fallbackBehaviour: "proceed",
		citationMode: true
	}));

	/** Fallback options lookup for the select dropdown. */
	public readonly fallbackOptions: Array<{ label: string; value: "proceed" | "pause" | "abort" }> =
	[
		{ label: "Proceed without context", value: "proceed" },
		{ label: "Pause and notify", value: "pause" },
		{ label: "Abort session", value: "abort" }
	];

	/** Display label for the citation mode toggle. */
	public readonly citationModeLabel: Signal<string> = computed((): string =>
	{
		return this.formState().draft.citationMode ? "Enabled" : "Disabled";
	});

	/** Settings Form Phase enum for the template. */
	public readonly SettingsFormPhase = SettingsFormPhase;

	/**
	 * Contract fetcher. Uses `resource` to auto-re-fetch if the active tenant changes,
	 * pushing the loaded live values into the form state on success.
	 */
	public readonly contract = resource({
		params: (): string | undefined => this._tenant(),
		loader: async ({ params }): Promise<AwarenessContractInfo> =>
		{
			if (!params) throw new Error("No tenant");
			const contract = await this._gateway.getAwarenessContract(params);
			// Only overlay pristine forms; do not blow away unsaved user edits.
			this.formState.update(function overlay(s: SettingsFormState<AwarenessFormDraft>): SettingsFormState<AwarenessFormDraft>
			{
				return s.phase === SettingsFormPhase.Pristine ? _CreateSettingsFormState({
					fallbackBehaviour: contract.fallbackBehaviour,
					citationMode: contract.citationMode
				}) : s;
			});
			return contract;
		}
	});

	/** User changed the fallback dropdown. */
	public onFallbackChange(value: string): void
	{
		this.formState.update(function apply(s: SettingsFormState<AwarenessFormDraft>): SettingsFormState<AwarenessFormDraft>
		{
			return _EditSettingsForm(s, { ...s.draft, fallbackBehaviour: value as "proceed" | "pause" | "abort" });
		});
	}

	/** User toggled citation mode. */
	public onCitationModeChange(value: boolean): void
	{
		this.formState.update(function apply(s: SettingsFormState<AwarenessFormDraft>): SettingsFormState<AwarenessFormDraft>
		{
			return _EditSettingsForm(s, { ...s.draft, citationMode: value });
		});
	}

	/** Saves the draft and transitions the form through the pending/success phases. */
	public async save(): Promise<void>
	{
		const tenant = this._tenant();
		if (!tenant) return;

		const stateBeforeSubmit = this.formState();
		if (stateBeforeSubmit.phase !== SettingsFormPhase.Dirty && stateBeforeSubmit.phase !== SettingsFormPhase.RecoverableError) return;

		this.formState.update(function apply(s: SettingsFormState<AwarenessFormDraft>): SettingsFormState<AwarenessFormDraft> { return _SubmitSettingsForm(s); });

		try
		{
			// We mock the save process here as the gateway only has read methods for awareness currently
			await new Promise(function delay(resolve) { setTimeout(resolve, 800); });
			
			const draft = stateBeforeSubmit.draft;
			this.formState.update(function apply(s: SettingsFormState<AwarenessFormDraft>): SettingsFormState<AwarenessFormDraft> { return _ResolveSettingsForm(s, { outcome: SettingsMutationOutcome.Success, accepted: { ...draft }, message: "Awareness contract updated." }); });
		}
		catch (e)
		{
			const msg = e instanceof Error ? e.message : "Failed to update contract.";
			this.formState.update(function apply(s: SettingsFormState<AwarenessFormDraft>): SettingsFormState<AwarenessFormDraft> { return _ResolveSettingsForm(s, { outcome: SettingsMutationOutcome.RecoverableError, message: msg }); });
		}
	}
}


