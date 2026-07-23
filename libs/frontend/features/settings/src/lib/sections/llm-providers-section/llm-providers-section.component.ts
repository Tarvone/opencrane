import { ChangeDetectionStrategy, Component, Signal, computed, signal, inject, resource, effect, untracked } from "@angular/core";

import { DestructiveActionPhase, DestructiveActionState, LlmProviderFeedback, LlmProviderId, LlmProviderOption, ModelRouteCategory, WorkspaceLlmProvider } from "@opencrane/core";
import { DestructiveConfirmationComponent } from "@opencrane/elements/ui";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { _settledValue } from "../../resource.util.js";

/** Mounted-only interaction phases for testing a transient provider key. */
type ConnectionPhase = "idle" | "testing" | "valid" | "invalid";

/** Workspace provider keys and category routing from the authoritative Paper handoff. */
@Component({
	selector: "wo-llm-providers-section",
	standalone: true,
	imports: [DestructiveConfirmationComponent],
	templateUrl: "./llm-providers-section.component.html",
	styleUrl: "./llm-providers-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class LlmProvidersSectionComponent
{
	private readonly _gateway = inject(SETTINGS_GATEWAY);
	private readonly _tenant = inject(ActiveTenantStore).tenant;

	/** Safe configured-provider metadata; never contains credential text. */
	public readonly providersResource = resource({
		params: () => this._tenant(),
		loader: ({ params }) => this._gateway.getWorkspaceLlmProviders(params ?? "")
	});
	public readonly providers = computed(() => _settledValue(this.providersResource) ?? []);

	/** Complete Add Provider Key catalogue. */
	public readonly providerOptionsResource = resource({
		loader: () => this._gateway.getLlmProviderOptions()
	});
	public readonly providerOptions = computed(() => _settledValue(this.providerOptionsResource) ?? []);

	/** Answer-model options used by every category selector. */
	public readonly modelOptionsResource = resource({
		loader: () => this._gateway.getLlmModelOptions()
	});
	public readonly modelOptions = computed(() => _settledValue(this.modelOptionsResource) ?? []);

	/** Fast classification models used by prompt analysis. */
	public readonly analysisModelOptionsResource = resource({
		loader: () => this._gateway.getLlmAnalysisModelOptions()
	});
	public readonly analysisModelOptions = computed(() => _settledValue(this.analysisModelOptionsResource) ?? []);

	/** Mounted-only route-owned Add Provider Key sub-page state. */
	public readonly addPageOpen = signal(false);

	/** Provider currently being configured in the Add sub-page. */
	public readonly selectedProviderId = signal<LlmProviderId | null>(null);

	/** Raw input exists only while this mounted component owns the add flow. */
	public readonly keyDraft = signal("");

	/** Current deterministic connection-test phase. */
	public readonly connectionPhase = signal<ConnectionPhase>("idle");

	/** Whether Save key owns the global add-form lock. */
	public readonly savePending = signal(false);

	/** Accessible provider mutation feedback. */
	public readonly feedback = signal<LlmProviderFeedback | null>(null);

	/** Configured provider waiting for confirmed removal. */
	public readonly removeTarget = signal<WorkspaceLlmProvider | null>(null);

	/** Button that opened removal confirmation and regains focus when it closes. */
	public readonly removeFocusTarget = signal<HTMLElement | null>(null);

	/** Surviving list control used when a successful removal destroys its invoker. */
	public readonly removeSuccessFocusTarget = signal<HTMLElement | null>(null);

	/** Shared destructive-confirmation state. */
	public readonly destructiveState = signal<DestructiveActionState>({ phase: DestructiveActionPhase.Idle });

	/** Selected fast classifier model. */
	public readonly analysisModel = signal("");

	/** Mounted-only route-category assignments. */
	public readonly routeCategoriesResource = resource({
		loader: () => this._gateway.getModelRouteCategories()
	});
	public readonly routeCategories = signal<readonly ModelRouteCategory[]>([]);

	/** Monotonic identity source for mounted-only categories added by the user. */
	private _nextCategoryId = 1;
	private _categoriesLoaded = false;

	constructor()
	{
		effect(() => {
			const options = this.analysisModelOptions();
			if (options.length > 0 && !untracked(() => this.analysisModel())) {
				this.analysisModel.set(options[0] ?? "");
			}
		});

		effect(() => {
			const categories = this.routeCategoriesResource.value();
			if (categories && !untracked(() => this._categoriesLoaded)) {
				untracked(() => {
					this._categoriesLoaded = true;
					this.routeCategories.set(structuredClone(categories));
					this._nextCategoryId = categories.length + 1;
				});
			}
		});
	}

	/** Selected provider metadata, derived without storing a second mutable copy. */
	public readonly selectedProvider: Signal<LlmProviderOption | null> = computed((): LlmProviderOption | null =>
	{
		const providerId = this.selectedProviderId();
		return this.providerOptions().find(function matches(option): boolean { return option.id === providerId; }) ?? null;
	});

	/** Open the authoritative sub-page with pristine transient state. */
	public openAddPage(): void
	{
		this._clearTransientKey();
		this.feedback.set(null);
		this.addPageOpen.set(true);
	}

	/** Return to the list and destroy all mounted credential input. */
	public closeAddPage(): void
	{
		if (this.connectionPhase() === "testing" || this.savePending()) return;
		this._clearTransientKey();
		this.selectedProviderId.set(null);
		this.feedback.set(null);
		this.addPageOpen.set(false);
	}

	/** Select a provider and discard any key entered for the previous choice. */
	public selectProvider(providerId: LlmProviderId): void
	{
		if (this.connectionPhase() === "testing" || this.savePending()) return;
		this._clearTransientKey();
		this.feedback.set(null);
		this.selectedProviderId.set(providerId);
	}

	/** Capture password-control input only in mounted component state. */
	public updateKeyDraft(event: Event): void
	{
		this.keyDraft.set((event.target as HTMLInputElement).value);
		this.connectionPhase.set("idle");
		this.feedback.set(null);
	}

	/** Test one transient key without allowing concurrent test/save actions. */
	public async testConnection(): Promise<void>
	{
		const providerId = this.selectedProviderId();
		const key = this.keyDraft();
		const tenant = this._tenant();
		if (providerId === null || !tenant || key.trim() === "" || this.connectionPhase() === "testing" || this.savePending()) return;

		this.connectionPhase.set("testing");
		this.feedback.set(null);
		try
		{
			await this._gateway.testWorkspaceLlmProviderConnection(tenant, providerId, key);
			this.connectionPhase.set("valid");
			this.feedback.set({ kind: "success", message: "Connection successful." });
		}
		catch
		{
			this.connectionPhase.set("invalid");
			this.feedback.set({ kind: "error", message: "The connection could not be tested. Try again." });
		}
	}

	/** Save one transient key through the fixture boundary, then destroy the input. */
	public async saveKey(): Promise<void>
	{
		const provider = this.selectedProvider();
		const key = this.keyDraft();
		const tenant = this._tenant();
		if (provider === null || !tenant || key.trim() === "" || this.connectionPhase() === "testing" || this.savePending()) return;

		this.savePending.set(true);
		this.feedback.set(null);
		try
		{
			await this._gateway.addWorkspaceLlmProvider(tenant, { id: provider.id, name: provider.name, models: provider.models });
			this.providersResource.reload();
			this._clearTransientKey();
			this.selectedProviderId.set(null);
			this.addPageOpen.set(false);
			this.feedback.set({ kind: "success", message: "Provider key saved successfully." });
		}
		catch
		{
			this.feedback.set({ kind: "error", message: "The provider key could not be saved. Try again." });
		}
		finally
		{
			this.savePending.set(false);
		}
	}

	/** Request explicit removal confirmation for one configured provider. */
	public requestRemove(provider: WorkspaceLlmProvider, event: Event, successFocusTarget: HTMLElement): void
	{
		this.feedback.set(null);
		this.destructiveState.set({ phase: DestructiveActionPhase.Idle });
		this.removeFocusTarget.set(event.currentTarget as HTMLElement | null);
		this.removeSuccessFocusTarget.set(successFocusTarget);
		this.removeTarget.set(provider);
	}

	/** Close a non-pending provider removal dialog. */
	public cancelRemove(): void
	{
		if (this.destructiveState().phase !== DestructiveActionPhase.Pending) this.removeTarget.set(null);
	}

	/** Remove the confirmed provider or expose a recoverable error in the dialog. */
	public async confirmRemove(): Promise<void>
	{
		const target = this.removeTarget();
		const tenant = this._tenant();
		if (target === null || !tenant || this.destructiveState().phase === DestructiveActionPhase.Pending) return;
		this.destructiveState.set({ phase: DestructiveActionPhase.Pending });
		try
		{
			await this._gateway.removeWorkspaceLlmProvider(tenant, target.id);
			this.removeFocusTarget.set(this.removeSuccessFocusTarget());
			this.providersResource.reload();
			this.destructiveState.set({ phase: DestructiveActionPhase.Success });
			this.removeTarget.set(null);
			this.feedback.set({ kind: "success", message: "Provider key removed successfully." });
		}
		catch
		{
			this.destructiveState.set({ phase: DestructiveActionPhase.Error, message: "The provider key could not be removed. Try again." });
		}
	}

	/** Select the prompt-analysis model. */
	public updateAnalysisModel(event: Event): void
	{
		this.analysisModel.set((event.target as HTMLSelectElement).value);
	}

	/** Update one category-to-model assignment. */
	public updateCategoryModel(categoryId: string, event: Event): void
	{
		const model = (event.target as HTMLSelectElement).value;
		this.routeCategories.update(function update(rows): readonly ModelRouteCategory[]
		{
			return rows.map(function change(row): ModelRouteCategory { return row.id === categoryId ? { ...row, model } : row; });
		});
	}

	/** Append one deterministic editable mock category. */
	public addCategory(): void
	{
		const id = `category-${this._nextCategoryId}`;
		this._nextCategoryId += 1;
		this.routeCategories.update(function append(rows): readonly ModelRouteCategory[]
		{
			return [...rows, { id, name: "New category", description: "Describe which prompts fall here.", model: "claude-sonnet-4-6" }];
		});
	}

	/** Remove one category assignment from mounted-only routing state. */
	public removeCategory(categoryId: string): void
	{
		this.routeCategories.update(function remove(rows): readonly ModelRouteCategory[] { return rows.filter(function keep(row): boolean { return row.id !== categoryId; }); });
	}

	/** Destroy the only state that may hold raw credential text. */
	private _clearTransientKey(): void
	{
		this.keyDraft.set("");
		this.connectionPhase.set("idle");
	}
}
