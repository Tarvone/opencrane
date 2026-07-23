import { ChangeDetectionStrategy, Component, Signal, computed, signal, inject, effect, resource } from "@angular/core";

import { SettingsFormPhase, SettingsFormState, SettingsMutationOutcome, SettingsNavigationDecision, SettingsUnsavedNavigationConfirmation, _ConfirmSettingsNavigation, _CreateSettingsFormState, _EditSettingsForm, _ReloadLatestSettingsForm, _ResetSettingsForm, _ResolveSettingsForm, _ReturnToEditingSettingsForm, _SubmitSettingsForm } from "@opencrane/core";
import { SaveButtonComponent } from "@opencrane/elements/ui";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { SETTINGS_GATEWAY, WorkspaceBudgetDraft, WorkspaceBudgetMember, WorkspaceBudgetRow, WorkspaceBudgetStatus, WorkspaceBudgetTotals } from "@opencrane/state/settings/adapter";

import { _WorkspaceBudgetTotals, _WorkspaceBudgetUsage, _WorkspaceBudgetValidationErrors } from "./budgets-section.utils.js";
import { _settledValue } from "../../resource.util.js";

/** Fixture-backed Workspace Budgets form matching the authoritative handoff. */
@Component({
	selector: "wo-budgets-section",
	standalone: true,
	imports: [SaveButtonComponent],
	templateUrl: "./budgets-section.component.html",
	styleUrl: "./budgets-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class BudgetsSectionComponent
{
	private readonly _gateway = inject(SETTINGS_GATEWAY);
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/** Immutable member identity and spend fixtures. */
	public readonly membersResource = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<WorkspaceBudgetMember[]> => this._gateway.getWorkspaceBudgetMembers(params ?? "")
	});
	public readonly members = computed(() => _settledValue(this.membersResource) ?? []);

	/** Reset date displayed in the organization summary. */
	public readonly resetDateResource = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<string> => this._gateway.getWorkspaceBudgetResetDate(params ?? "")
	});
	public readonly resetDate = computed(() => _settledValue(this.resetDateResource) ?? "");

	/** Resource-backed budget draft. */
	public readonly draftResource = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<WorkspaceBudgetDraft> => this._gateway.getWorkspaceBudgetDraft(params ?? "")
	});

	/** Controlled lifecycle for every editable monthly limit. */
	public readonly formState = signal<SettingsFormState<WorkspaceBudgetDraft>>(_CreateSettingsFormState({ limits: {} }));

	constructor()
	{
		effect(() =>
		{
			const draftData = _settledValue(this.draftResource);
			if (draftData)
			{
				this.formState.update(s => s.phase === SettingsFormPhase.Pristine ? _CreateSettingsFormState(draftData) : s);
			}
		});
	}

	/** Budget status enum exposed to the external template. */
	public readonly WorkspaceBudgetStatus = WorkspaceBudgetStatus;

	/** Organization totals recomputed from immutable spend and the current draft. */
	public readonly totals: Signal<WorkspaceBudgetTotals> = computed((): WorkspaceBudgetTotals => _WorkspaceBudgetTotals(this.members(), this.formState().draft));

	/** Member rows projected with safe progress and threshold status. */
	public readonly rows: Signal<readonly WorkspaceBudgetRow[]> = computed((): readonly WorkspaceBudgetRow[] =>
	{
		const draft = this.formState().draft;
		return this.members().map(function memberRow(member): WorkspaceBudgetRow
		{
			const limit = draft.limits[member.id] ?? 0;
			return { ...member, limit, ..._WorkspaceBudgetUsage(member.spent, limit) };
		});
	});

	/** Update one limit and validate the complete draft. */
	public editLimit(memberId: string, event: Event): void
	{
		const input = event.target as HTMLInputElement;
		const limit = input.value.trim().length === 0 ? Number.NaN : input.valueAsNumber;
		const draft: WorkspaceBudgetDraft = { limits: { ...this.formState().draft.limits, [memberId]: limit } };
		this.formState.update(function edit(state): SettingsFormState<WorkspaceBudgetDraft>
		{
			return _EditSettingsForm(state, draft, _WorkspaceBudgetValidationErrors(draft));
		});
	}

	/** Capture and submit one valid draft while preventing duplicate attempts. */
	public async submit(): Promise<void>
	{
		const current = this.formState();
		if (current.phase === SettingsFormPhase.Pending) return;
		const pending = _SubmitSettingsForm(current);
		if (pending.phase !== SettingsFormPhase.Pending) return;
		this.formState.set(pending);

		const tenantName = this._tenant();
		if (!tenantName)
		{
			this.formState.update(state => _ResolveSettingsForm(state, { outcome: SettingsMutationOutcome.RecoverableError, message: "No active tenant." }));
			return;
		}

		try
		{
			const acceptedDraft = await this._gateway.updateWorkspaceBudgetDraft(tenantName, pending.pendingDraft);
			
			this.draftResource.reload();
			
			this.formState.update(function resolve(state): SettingsFormState<WorkspaceBudgetDraft> { 
				return _ResolveSettingsForm(state, { outcome: SettingsMutationOutcome.Success, accepted: acceptedDraft, message: "Budget changes saved." }); 
			});
		}
		catch (error)
		{
			const message = error instanceof Error ? error.message : "Failed to save Budget changes.";
			this.formState.update(function resolve(state): SettingsFormState<WorkspaceBudgetDraft>
			{
				return _ResolveSettingsForm(state, { outcome: SettingsMutationOutcome.RecoverableError, message });
			});
		}
	}

	/** Accept the latest fixture value exposed by a conflict. */
	public reloadLatest(): void
	{
		this.formState.update(_ReloadLatestSettingsForm);
	}

	/** Resume editing the preserved conflict draft. */
	public returnToEditing(): void
	{
		this.formState.update(_ReturnToEditingSettingsForm);
	}

	/** Delegate unsafe route navigation to the shared confirmation boundary. */
	public canDeactivate(confirmation: SettingsUnsavedNavigationConfirmation): SettingsNavigationDecision
	{
		return _ConfirmSettingsNavigation(this.formState(), confirmation);
	}
}
