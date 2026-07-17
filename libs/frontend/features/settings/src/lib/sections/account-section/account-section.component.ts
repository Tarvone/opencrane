import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource, signal, effect } from "@angular/core";

import { SettingsFormPhase, SettingsFormState, SettingsMutationOutcome, _CreateSettingsFormState, _EditSettingsForm, _ResolveSettingsForm, _SubmitSettingsForm } from "@opencrane/core";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { AvatarCircleComponent, SaveButtonComponent, SectionHeadingComponent, SettingsRowComponent, ToggleFieldComponent } from "@opencrane/elements/ui";
import { AccountProfile, AccountProfileUpdate, SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { _settledValue } from "../../resource.util.js";

interface AccountFormDraft { fullName: string; }

/** Account settings section. */
@Component({
	selector: "wo-account-section",
	standalone: true,
	imports: [AvatarCircleComponent, SectionHeadingComponent, SettingsRowComponent, SaveButtonComponent, ToggleFieldComponent],
	templateUrl: "./account-section.component.html",
	styleUrl: "./account-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Active pod/tenant name, resolved at the state level (live, or demo pod in mock/offline dev). */
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/**
	 * Account profile for the active pod, re-fetched whenever the active tenant
	 * changes. Stays idle (no request) until a tenant resolves.
	 */
	private readonly _profile = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<AccountProfile> => this._gateway.getAccountProfile(params)
	});

	/** Form state signal. */
	public readonly formState = signal<SettingsFormState<AccountFormDraft>>(_CreateSettingsFormState({ fullName: "" }));

	/** Form phase enum exposed to the template. */
	public readonly SettingsFormPhase = SettingsFormPhase;

	constructor()
	{
		// Seed form state when profile loads
		effect(() =>
		{
			const profile = _settledValue(this._profile);
			if (profile)
			{
				this.formState.update(s => s.phase === SettingsFormPhase.Pristine ? _CreateSettingsFormState({ fullName: profile.fullName }) : s);
			}
		}, { allowSignalWrites: true });
	}

	/** Avatar initials computed from form draft fullName. */
	public readonly avatarInitials: Signal<string> = computed((): string =>
	{
		const name = this.formState().draft.fullName.trim();
		if (!name) return "";
		const parts = name.split(/\s+/);
		return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
	});

	/** Org-managed email shown read-only. */
	public readonly email: Signal<string> = computed((): string =>
	{
		return _settledValue(this._profile)?.email ?? "";
	});

	/** Role of the user. */
	public readonly role: Signal<string> = computed((): string =>
	{
		return _settledValue(this._profile)?.role ?? "";
	});

	/** Notification preference labels. */
	public readonly notificationPreferences: string[] =
	[
		"Skill promotion updates",
		"Budget alerts",
		"Awareness contract rollouts",
		"Harvest completions",
		"Policy changes"
	];

	/** Handles input changes. */
	public onFullNameChange(event: Event): void
	{
		const input = event.target as HTMLInputElement;
		this.formState.update(s => _EditSettingsForm(s, { fullName: input.value }));
	}

	/** Save the profile changes. */
	public async save(): Promise<void>
	{
		const tenant = this._tenant();
		if (!tenant) return;

		const stateBeforeSubmit = this.formState();
		if (stateBeforeSubmit.phase !== SettingsFormPhase.Dirty && stateBeforeSubmit.phase !== SettingsFormPhase.RecoverableError) return;
		const draft = stateBeforeSubmit.draft;

		this.formState.update(_SubmitSettingsForm);

		try
		{
			const update: AccountProfileUpdate = { fullName: draft.fullName };
			const accepted = await this._gateway.updateAccountProfile(tenant, update);
			this.formState.update(s => _ResolveSettingsForm(s, { outcome: SettingsMutationOutcome.Success, accepted: { fullName: accepted.fullName }, message: "Account profile updated." }));
		}
		catch (e)
		{
			const msg = e instanceof Error ? e.message : "Failed to save profile.";
			this.formState.update(s => _ResolveSettingsForm(s, { outcome: SettingsMutationOutcome.RecoverableError, message: msg }));
		}
	}
}
