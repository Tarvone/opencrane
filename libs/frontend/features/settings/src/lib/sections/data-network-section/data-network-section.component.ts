import { ChangeDetectionStrategy, Component, signal } from "@angular/core";

import { DataNetworkDataset, EgressDomain, EgressFeedback, EgressFeedbackKind, EgressMutation, EgressMutationOutcome, ScopeLevel, _ValidateEgressDomain } from "@opencrane/core";
import { DATA_NETWORK_DATASETS_FIXTURE, EGRESS_PURPOSES_FIXTURE, EGRESS_SUCCESS_MUTATION_RESULT_FIXTURE, EGRESS_DOMAINS, MockEgressMutation } from "@opencrane/core/testing";

/** Pristine purpose selected whenever the Add Domain form opens. */
const DEFAULT_EGRESS_PURPOSE = EGRESS_PURPOSES_FIXTURE[0] ?? "Custom domain";

/** Mock-only Workspace Data & Network section from the authoritative handoff. */
@Component({
	selector: "wo-data-network-section",
	standalone: true,
	templateUrl: "./data-network-section.component.html",
	styleUrl: "./data-network-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataNetworkSectionComponent
{
	/** Cognee-backed scope datasets projected for this settings view. */
	public readonly datasets = signal<readonly DataNetworkDataset[]>(structuredClone(DATA_NETWORK_DATASETS_FIXTURE));

	/** Mounted-only egress allowlist state. */
	public readonly domains = signal<readonly EgressDomain[]>(structuredClone(EGRESS_DOMAINS));

	/** Purpose options kept explicit in every new egress fixture row. */
	public readonly purposes = EGRESS_PURPOSES_FIXTURE;

	/** Whether the inline Add Domain form is visible. */
	public readonly addFormOpen = signal(false);

	/** Exact or leading-wildcard domain draft. */
	public readonly domainDraft = signal("");

	/** Explicit category or purpose stored with the domain. */
	public readonly purposeDraft = signal(DEFAULT_EGRESS_PURPOSE);

	/** Current domain validation error. */
	public readonly validationError = signal<string | null>(null);

	/** Whether the mock add mutation currently locks the form. */
	public readonly pending = signal(false);

	/** Accessible mutation result feedback. */
	public readonly feedback = signal<EgressFeedback | null>(null);

	/** Deterministic mutation boundary replaceable by focused tests. */
	public mutation: EgressMutation = new MockEgressMutation([], EGRESS_SUCCESS_MUTATION_RESULT_FIXTURE);

	/** Feedback kinds exposed to the external template. */
	public readonly EgressFeedbackKind = EgressFeedbackKind;

	/** Open a clean inline Add Domain form. */
	public openAddForm(): void
	{
		this.domainDraft.set("");
		this.purposeDraft.set(DEFAULT_EGRESS_PURPOSE);
		this.validationError.set(null);
		this.feedback.set(null);
		this.addFormOpen.set(true);
	}

	/** Cancel a non-pending domain draft and remove it from transient state. */
	public cancelAddForm(): void
	{
		if (this.pending()) return;
		this.domainDraft.set("");
		this.purposeDraft.set(DEFAULT_EGRESS_PURPOSE);
		this.validationError.set(null);
		this.feedback.set(null);
		this.addFormOpen.set(false);
	}

	/** Capture domain input without persisting it outside the mounted component. */
	public updateDomainDraft(event: Event): void
	{
		this.domainDraft.set((event.target as HTMLInputElement).value);
		this.validationError.set(null);
	}

	/** Capture one explicit egress purpose from the form. */
	public updatePurposeDraft(event: Event): void
	{
		this.purposeDraft.set((event.target as HTMLSelectElement).value);
	}

	/** Add one normalized host to mounted fixture state after deterministic validation. */
	public async addDomain(event?: Event): Promise<void>
	{
		event?.preventDefault();
		if (this.pending()) return;

		// 1. Validate against current mounted rows so malformed and duplicate hosts never reach mutation state.
		const validation = _ValidateEgressDomain(this.domainDraft(), this.domains().map(function domain(row): string { return row.domain; }));
		this.validationError.set(validation.error);
		if (validation.normalizedDomain === null) return;
		const normalizedDomain = validation.normalizedDomain;

		// 2. Lock the form while the deterministic boundary resolves to prevent duplicate additions.
		this.pending.set(true);
		this.feedback.set(null);
		try
		{
			const result = await this.mutation.mutate(normalizedDomain);
			if (result.outcome === EgressMutationOutcome.RecoverableError)
			{
				this.feedback.set({ kind: EgressFeedbackKind.Error, message: result.message });
				return;
			}

			// 3. Commit success to mounted-only state and clear the accepted transient draft.
			const purpose = this.purposeDraft();
			this.domains.update(function append(domains): readonly EgressDomain[] { return [...domains, { domain: normalizedDomain, purpose, status: "active" }]; });
			this.domainDraft.set("");
			this.addFormOpen.set(false);
			this.feedback.set({ kind: EgressFeedbackKind.Success, message: `${normalizedDomain} added to the egress allowlist.` });
		}
		catch
		{
			this.feedback.set({ kind: EgressFeedbackKind.Error, message: "The domain could not be added. Try again." });
		}
		finally
		{
			this.pending.set(false);
		}
	}

	/** Present the compact scope label used by the authoritative handoff. */
	public scopeLabel(scope: ScopeLevel): string
	{
		switch (scope)
		{
			case ScopeLevel.Org: return "org scope";
			case ScopeLevel.Dept: return "dept scope";
			case ScopeLevel.Project: return "project scope";
			case ScopeLevel.Personal: return "personal scope";
		}
	}
}
