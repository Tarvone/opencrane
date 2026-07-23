import { ChangeDetectionStrategy, Component, computed, signal, inject, resource } from "@angular/core";

import { EgressFeedback, EgressFeedbackKind, ScopeLevel, _ValidateEgressDomain } from "@opencrane/core";

import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { _settledValue } from "../../resource.util.js";

/** Pristine purpose selected whenever the Add Domain form opens. */
const EGRESS_PURPOSES: readonly string[] = ["AI provider", "Skill connector", "Research source", "Custom domain"];
const DEFAULT_EGRESS_PURPOSE = EGRESS_PURPOSES[0] ?? "Custom domain";

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
	private readonly _gateway = inject(SETTINGS_GATEWAY);
	private readonly _tenant = inject(ActiveTenantStore).tenant;

	/** Cognee-backed scope datasets projected for this settings view. */
	public readonly datasetsResource = resource({
		params: () => this._tenant(),
		loader: ({ params }) => this._gateway.getWorkspaceDataNetworks(params ?? "")
	});
	public readonly datasets = computed(() => _settledValue(this.datasetsResource) ?? []);

	/** Mounted-only egress allowlist state. */
	public readonly domainsResource = resource({
		params: () => this._tenant(),
		loader: ({ params }) => this._gateway.getWorkspaceEgressDomains(params ?? "")
	});
	public readonly domains = computed(() => _settledValue(this.domainsResource) ?? []);

	/** Purpose options kept explicit in every new egress fixture row. */
	public readonly purposes = EGRESS_PURPOSES;

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

		const validation = _ValidateEgressDomain(this.domainDraft(), this.domains().map(function domain(row): string { return row.domain; }));
		this.validationError.set(validation.error);
		if (validation.normalizedDomain === null) return;
		const normalizedDomain = validation.normalizedDomain;

		this.pending.set(true);
		this.feedback.set(null);
		try
		{
			const tenant = this._tenant();
			if (!tenant) throw new Error("No active tenant");

			await this._gateway.addWorkspaceEgressDomain(tenant, normalizedDomain, this.purposeDraft());

			this.domainsResource.reload();
			this.domainDraft.set("");
			this.addFormOpen.set(false);
			this.feedback.set({ kind: EgressFeedbackKind.Success, message: `${normalizedDomain} added to the egress allowlist.` });
		}
		catch (error: unknown)
		{
			const message = error instanceof Error ? error.message : "The domain could not be added. Try again.";
			this.feedback.set({ kind: EgressFeedbackKind.Error, message });
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
