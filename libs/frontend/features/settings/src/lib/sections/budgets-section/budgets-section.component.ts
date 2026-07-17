import { ChangeDetectionStrategy, Component, Signal, computed, signal } from "@angular/core";

import { SettingsFormPhase, SettingsFormState, SettingsMutation, SettingsMutationOutcome, SettingsNavigationDecision, SettingsUnsavedNavigationConfirmation, _ConfirmSettingsNavigation, _CreateSettingsFormState, _EditSettingsForm, _ReloadLatestSettingsForm, _ResolveSettingsForm, _ReturnToEditingSettingsForm, _SubmitSettingsForm } from "@opencrane/core";
import { SaveButtonComponent } from "@opencrane/elements/ui";

import { WORKSPACE_BUDGET_DRAFT_FIXTURE, WORKSPACE_BUDGET_MEMBERS_FIXTURE, WORKSPACE_BUDGET_RESET_DATE_FIXTURE, WORKSPACE_BUDGET_SUCCESS_MUTATION } from "./budgets-section.fixtures.js";
import { WorkspaceBudgetDraft, WorkspaceBudgetMember, WorkspaceBudgetRow, WorkspaceBudgetStatus, WorkspaceBudgetTotals } from "./budgets-section.types.js";
import { _WorkspaceBudgetTotals, _WorkspaceBudgetUsage, _WorkspaceBudgetValidationErrors } from "./budgets-section.utils.js";

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
	/** Immutable member identity and spend fixtures. */
	public readonly members: readonly WorkspaceBudgetMember[] = WORKSPACE_BUDGET_MEMBERS_FIXTURE;

	/** Handoff reset date. */
	public readonly resetDate = WORKSPACE_BUDGET_RESET_DATE_FIXTURE;

	/** Controlled lifecycle for every editable monthly limit. */
	public readonly formState = signal<SettingsFormState<WorkspaceBudgetDraft>>(_CreateSettingsFormState(WORKSPACE_BUDGET_DRAFT_FIXTURE));

	/** Deterministic mutation boundary replaceable by focused tests. */
	public mutation: SettingsMutation<WorkspaceBudgetDraft> = WORKSPACE_BUDGET_SUCCESS_MUTATION;

	/** Budget status enum exposed to the external template. */
	public readonly WorkspaceBudgetStatus = WorkspaceBudgetStatus;

	/** Organization totals recomputed from immutable spend and the current draft. */
	public readonly totals: Signal<WorkspaceBudgetTotals> = computed((): WorkspaceBudgetTotals => _WorkspaceBudgetTotals(this.members, this.formState().draft));

	/** Member rows projected with safe progress and threshold status. */
	public readonly rows: Signal<readonly WorkspaceBudgetRow[]> = computed((): readonly WorkspaceBudgetRow[] =>
	{
		const draft = this.formState().draft;
		return this.members.map(function memberRow(member): WorkspaceBudgetRow
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
		try
		{
			const result = await this.mutation.mutate(pending.pendingDraft);
			this.formState.update(function resolve(state): SettingsFormState<WorkspaceBudgetDraft> { return _ResolveSettingsForm(state, result); });
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
